use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use percent_encoding::{AsciiSet, NON_ALPHANUMERIC};
use serde::{Deserialize, Serialize};
use std::fs;
use std::time::Duration;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_opener::OpenerExt;
use xcap::Window;

#[derive(Serialize, Clone)]
struct GalleryImage {
    name: String,
    creator: String,
    family: String,
    path: String,
}

const IMAGE_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

fn images_dir(app: &tauri::AppHandle) -> tauri::Result<std::path::PathBuf> {
    let dir = app.path().app_data_dir()?.join("Maps");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

// Lives alongside (not inside) the synced Maps/ dir specifically so that
// replace_maps' remove_dir_all/rename swap (see that fn) never touches it -
// users can drop their own callouts here and a map pack update won't wipe them.
fn custom_images_dir(app: &tauri::AppHandle) -> tauri::Result<std::path::PathBuf> {
    let dir = app.path().app_data_dir()?.join("CustomMaps");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

// The map pack lives in this GitHub repo's "Maps" directory rather than
// being bundled with the app, so new maps/creators can ship without a full
// app update - the client just pulls whatever's on the default branch.
const MAPS_REPO_OWNER: &str = "ExeQOrg";
const MAPS_REPO_NAME: &str = "dbd-overlay";
const MAPS_REPO_DIR: &str = "Maps";

// Map/creator names can contain spaces, apostrophes, etc. - raw.githubusercontent.com
// rejects unescaped versions of those in the URL path, so every path segment
// needs percent-encoding before being spliced into a raw file URL. `/` is left
// alone since it's the path separator, not part of a name.
const PATH_SEGMENT_ENCODE_SET: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'/')
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'~');

#[derive(Deserialize)]
struct CommitEntry {
    sha: String,
}

#[derive(Deserialize)]
struct GitTree {
    tree: Vec<TreeEntry>,
    truncated: bool,
}

#[derive(Deserialize)]
struct TreeEntry {
    path: String,
    #[serde(rename = "type")]
    kind: String,
}

#[derive(Serialize, Deserialize)]
struct MapsVersion {
    sha: String,
}

fn maps_version_file(app: &tauri::AppHandle) -> tauri::Result<std::path::PathBuf> {
    Ok(app.path().app_data_dir()?.join("maps-version.json"))
}

// Tracks where the startup maps sync currently is so the frontend can show a
// blocking loading screen for it. Kept in managed state (not just events)
// because the sync thread is spawned during `.setup()`, before the frontend
// has necessarily attached its event listener - a state snapshot lets it
// catch up via a command instead of missing events emitted too early.
#[derive(Serialize, Clone)]
struct MapsSyncState {
    phase: String, // "checking" | "downloading" | "done" | "error"
    current: u64,
    total: u64,
    error: Option<String>,
}

struct MapsSyncStateStore(std::sync::Mutex<MapsSyncState>);

fn set_maps_sync_state(app: &tauri::AppHandle, state: MapsSyncState) {
    if let Some(store) = app.try_state::<MapsSyncStateStore>() {
        *store.0.lock().unwrap() = state.clone();
    }
    let _ = app.emit("maps-sync-state", state);
}

#[tauri::command]
fn get_maps_sync_status(app: tauri::AppHandle) -> MapsSyncState {
    app.state::<MapsSyncStateStore>().0.lock().unwrap().clone()
}

// Set only on the raw exe built with `--features portable` in CI (see
// .github/workflows/release.yml) - the installer builds don't set it. Lets
// the frontend show a "portable" badge and, later, skip update-checking for
// copies that didn't come from an installer.
#[tauri::command]
fn is_portable() -> bool {
    cfg!(feature = "portable")
}

fn latest_maps_commit_sha(agent: &ureq::Agent) -> Result<String, String> {
    let url = format!(
        "https://api.github.com/repos/{MAPS_REPO_OWNER}/{MAPS_REPO_NAME}/commits?path={MAPS_REPO_DIR}&per_page=1"
    );
    let commits: Vec<CommitEntry> = agent
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| e.to_string())?
        .body_mut()
        .read_json()
        .map_err(|e| e.to_string())?;

    commits
        .into_iter()
        .next()
        .map(|c| c.sha)
        .ok_or_else(|| format!("no commits found for {MAPS_REPO_DIR}"))
}

// Downloads every file under Maps/ at `sha` into a staging directory, then
// swaps it in for the live one - so a network failure mid-download leaves
// the existing map pack untouched instead of half-replaced.
fn replace_maps(
    app: &tauri::AppHandle,
    agent: &ureq::Agent,
    sha: &str,
    version_path: &std::path::Path,
) -> Result<(), String> {
    let tree_url = format!(
        "https://api.github.com/repos/{MAPS_REPO_OWNER}/{MAPS_REPO_NAME}/git/trees/{sha}?recursive=1"
    );
    let tree: GitTree = agent
        .get(&tree_url)
        .header("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| e.to_string())?
        .body_mut()
        .read_json()
        .map_err(|e| e.to_string())?;

    if tree.truncated {
        return Err("repository tree listing was truncated by GitHub, skipping update".to_string());
    }

    let prefix = format!("{MAPS_REPO_DIR}/");
    let files: Vec<&str> = tree
        .tree
        .iter()
        .filter(|entry| entry.kind == "blob" && entry.path.starts_with(&prefix))
        .map(|entry| entry.path.as_str())
        .collect();

    if files.is_empty() {
        return Err(format!("no files found under {MAPS_REPO_DIR} in the repository"));
    }

    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let maps_dir = app_data.join(MAPS_REPO_DIR);
    let staging_dir = app_data.join("Maps.download");

    if staging_dir.exists() {
        fs::remove_dir_all(&staging_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&staging_dir).map_err(|e| e.to_string())?;

    let total = files.len() as u64;
    set_maps_sync_state(
        app,
        MapsSyncState { phase: "downloading".to_string(), current: 0, total, error: None },
    );

    for (index, path) in files.into_iter().enumerate() {
        let relative = path.strip_prefix(&prefix).unwrap_or(path);
        let dest = staging_dir.join(relative);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let encoded_path =
            percent_encoding::utf8_percent_encode(path, PATH_SEGMENT_ENCODE_SET).to_string();
        let raw_url = format!(
            "https://raw.githubusercontent.com/{MAPS_REPO_OWNER}/{MAPS_REPO_NAME}/{sha}/{encoded_path}"
        );
        let mut response = agent
            .get(&raw_url)
            .call()
            .map_err(|e| format!("failed to download {path}: {e}"))?;
        let mut file = fs::File::create(&dest).map_err(|e| e.to_string())?;
        std::io::copy(&mut response.body_mut().as_reader(), &mut file)
            .map_err(|e| format!("failed to save {path}: {e}"))?;

        set_maps_sync_state(
            app,
            MapsSyncState {
                phase: "downloading".to_string(),
                current: index as u64 + 1,
                total,
                error: None,
            },
        );
    }

    if maps_dir.exists() {
        fs::remove_dir_all(&maps_dir).map_err(|e| e.to_string())?;
    }
    fs::rename(&staging_dir, &maps_dir).map_err(|e| e.to_string())?;

    let version_json = serde_json::to_string(&MapsVersion { sha: sha.to_string() }).map_err(|e| e.to_string())?;
    fs::write(version_path, version_json).map_err(|e| e.to_string())?;

    let _ = app.emit("maps-updated", ());

    Ok(())
}

fn maps_sync_done(app: &tauri::AppHandle) {
    set_maps_sync_state(
        app,
        MapsSyncState { phase: "done".to_string(), current: 0, total: 0, error: None },
    );
}

fn maps_sync_failed(app: &tauri::AppHandle, error: String) {
    set_maps_sync_state(
        app,
        MapsSyncState { phase: "error".to_string(), current: 0, total: 0, error: Some(error) },
    );
}

// Runs on startup on a background thread: checks the latest commit touching
// Maps/ in the repo and, if it differs from the sha we last downloaded,
// replaces the local map pack. Failures (offline, rate-limited, etc.) are
// logged and otherwise ignored so a bad network doesn't block startup or
// disturb whatever maps are already on disk.
fn sync_maps_with_repo(app: &tauri::AppHandle) {
    set_maps_sync_state(
        app,
        MapsSyncState { phase: "checking".to_string(), current: 0, total: 0, error: None },
    );

    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(20)))
        .user_agent("dbd-toolbox")
        .build()
        .into();

    let latest_sha = match latest_maps_commit_sha(&agent) {
        Ok(sha) => sha,
        Err(e) => {
            eprintln!("failed to check for map updates: {e}");
            maps_sync_failed(app, e);
            return;
        }
    };

    let version_path = match maps_version_file(app) {
        Ok(path) => path,
        Err(e) => {
            eprintln!("failed to resolve maps-version.json path: {e}");
            maps_sync_failed(app, e.to_string());
            return;
        }
    };

    let stored_sha = fs::read_to_string(&version_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<MapsVersion>(&raw).ok())
        .map(|v| v.sha);

    if stored_sha.as_deref() == Some(latest_sha.as_str()) {
        maps_sync_done(app);
        return;
    }

    match replace_maps(app, &agent, &latest_sha, &version_path) {
        Ok(()) => maps_sync_done(app),
        Err(e) => {
            eprintln!("failed to download map updates: {e}");
            maps_sync_failed(app, e);
        }
    }
}

fn is_image_file(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| IMAGE_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn file_stem_string(path: &std::path::Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string()
}

// Directory names (creator/family) are used as-is, unlike file_stem_string,
// so a folder like "M.T. Designs" doesn't get truncated at the first dot.
fn dir_name_string(path: &std::path::Path) -> String {
    path.file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string()
}

// Maps/<Creator>/<Family>/<MapName>.png - the family subfolder groups the
// map variants that share a realm (e.g. "Coldwind Farm"), since the in-game
// text shows both ("Coldwind Farm - Rotten Fields") but only the map name
// itself is meaningful as a display name.
fn collect_family_images(
    dir: &std::path::Path,
    creator: &str,
    family: &str,
    images: &mut Vec<GalleryImage>,
) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)?.filter_map(|entry| entry.ok()) {
        let path = entry.path();
        if path.is_file() && is_image_file(&path) {
            images.push(GalleryImage {
                name: file_stem_string(&path),
                creator: creator.to_string(),
                family: family.to_string(),
                path: path.to_string_lossy().to_string(),
            });
        }
    }
    Ok(())
}

// Maps/<Creator>/<Family or loose file>/... - shared by the synced Maps dir
// and the user-owned CustomMaps dir so both are browsable the same way.
fn collect_root_images(root: &std::path::Path, images: &mut Vec<GalleryImage>) -> std::io::Result<()> {
    for creator_entry in fs::read_dir(root)?.filter_map(|entry| entry.ok()) {
        let creator_path = creator_entry.path();
        if !creator_path.is_dir() {
            continue;
        }
        let creator = dir_name_string(&creator_path);

        for sub_entry in fs::read_dir(&creator_path)?.filter_map(|entry| entry.ok()) {
            let sub_path = sub_entry.path();
            if sub_path.is_dir() {
                let family = dir_name_string(&sub_path);
                collect_family_images(&sub_path, &creator, &family, images)?;
            } else if is_image_file(&sub_path) {
                // an image placed directly under the creator folder, with no family subfolder
                images.push(GalleryImage {
                    name: file_stem_string(&sub_path),
                    creator: creator.clone(),
                    family: String::new(),
                    path: sub_path.to_string_lossy().to_string(),
                });
            }
        }
    }
    Ok(())
}

// Runs the directory walk on a blocking thread (see capture_screen_region's
// comment) since this is invoked alongside every scan, not just on-demand
// gallery refreshes.
#[tauri::command]
async fn list_gallery_images(app: tauri::AppHandle) -> Result<Vec<GalleryImage>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut images: Vec<GalleryImage> = Vec::new();

        let root = images_dir(&app).map_err(|e| e.to_string())?;
        collect_root_images(&root, &mut images).map_err(|e| e.to_string())?;

        let custom_root = custom_images_dir(&app).map_err(|e| e.to_string())?;
        collect_root_images(&custom_root, &mut images).map_err(|e| e.to_string())?;

        images.sort_by(|a, b| {
            a.creator
                .cmp(&b.creator)
                .then(a.family.cmp(&b.family))
                .then(a.name.cmp(&b.name))
        });

        Ok(images)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CapturableWindow {
    title: String,
    app_name: String,
}

// Titles xcap would otherwise report for this app's own windows - excluded
// so the picker only ever lists other running programs.
const OWN_WINDOW_TITLES: [&str; 2] = ["DBD Toolbox", "Overlay"];

#[tauri::command]
fn list_capturable_windows() -> Result<Vec<CapturableWindow>, String> {
    let windows = Window::all().map_err(|e| e.to_string())?;

    let mut seen = std::collections::HashSet::new();
    let mut result: Vec<CapturableWindow> = windows
        .into_iter()
        .filter_map(|w| {
            let title = w.title().ok()?;
            if title.trim().is_empty() || OWN_WINDOW_TITLES.contains(&title.as_str()) {
                return None;
            }
            Some(CapturableWindow {
                title,
                app_name: w.app_name().unwrap_or_default(),
            })
        })
        .filter(|w| seen.insert(w.title.clone()))
        .collect();

    result.sort_by(|a, b| a.title.cmp(&b.title));

    Ok(result)
}

// x, y, width, height are fractions (0.0-1.0) of the captured window, so the
// scan region stays correct regardless of the window's resolution/scaling.
#[derive(serde::Deserialize)]
struct RegionInput {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    grayscale: bool,
}

// Captures the target window once and crops out every requested region from
// that single capture, so scanning N regions costs one window enumeration +
// screenshot instead of N.
//
// A plain (non-async) #[tauri::command] still runs its body inline on
// Tauri's async runtime when invoked - it is NOT automatically dispatched to
// a blocking thread pool. Since window enumeration, screen capture, and the
// per-region crop/threshold/encode work here are all synchronous and CPU/IO
// bound, running them inline would stall that runtime (and, with it, the
// rest of the app) for the duration of the scan. Wrapping the work in
// `spawn_blocking` moves it onto a dedicated blocking thread so the UI stays
// responsive while a scan is in progress.
#[tauri::command]
async fn capture_screen_region(
    regions: Vec<RegionInput>,
    window_title: String,
    brightness_threshold: u8,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let windows = Window::all().map_err(|e| e.to_string())?;
        let needle = window_title.to_lowercase();
        let window = windows
            .into_iter()
            .find(|w| w.title().map(|t| t.to_lowercase().contains(&needle)).unwrap_or(false))
            .ok_or_else(|| format!("Window \"{}\" not found - is the game running?", window_title))?;

        let mut image = window
            .capture_image()
            .map_err(|e| format!("failed to capture \"{}\": {}", window_title, e))?;

        let win_width = image.width();
        let win_height = image.height();

        let mut results = Vec::with_capacity(regions.len());
        for region in &regions {
            let px = (region.x.clamp(0.0, 1.0) * win_width as f64) as u32;
            let py = (region.y.clamp(0.0, 1.0) * win_height as f64) as u32;
            let pw = (region.width.clamp(0.0, 1.0) * win_width as f64)
                .max(1.0)
                .min((win_width.saturating_sub(px)) as f64) as u32;
            let ph = (region.height.clamp(0.0, 1.0) * win_height as f64)
                .max(1.0)
                .min((win_height.saturating_sub(py)) as f64) as u32;

            let cropped = image::imageops::crop(&mut image, px, py, pw, ph).to_image();

            let mut buf: Vec<u8> = Vec::new();
            if region.grayscale {
                // Map names render as solid light text over a translucent bar, but
                // the game background behind/around it is busy and confuses the OCR
                // engine into "reading" nonsense. Crushing the crop to grayscale
                // then to pure black/white isolates the bright text and drops most
                // of that noise.
                let mut gray = image::DynamicImage::ImageRgba8(cropped).to_luma8();
                for pixel in gray.pixels_mut() {
                    pixel[0] = if pixel[0] >= brightness_threshold { 255 } else { 0 };
                }
                image::DynamicImage::ImageLuma8(gray)
                    .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
                    .map_err(|e| e.to_string())?;
            } else {
                image::DynamicImage::ImageRgba8(cropped)
                    .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
                    .map_err(|e| e.to_string())?;
            }

            results.push(format!("data:image/png;base64,{}", BASE64.encode(&buf)));
        }

        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

// Called from the frontend whenever the user (re)maps the manual-scan
// shortcut - both on every app startup (to apply whatever was saved last,
// since only the frontend persists it) and whenever they record a new one.
// Only one shortcut is ever registered by this app, so unregistering
// everything first keeps this idempotent without tracking the previous value.
#[tauri::command]
fn set_scan_shortcut(app: tauri::AppHandle, shortcut: String) -> Result<(), String> {
    app.global_shortcut().unregister_all().map_err(|e| e.to_string())?;
    app.global_shortcut()
        .register(shortcut.as_str())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_custom_maps_folder(app: tauri::AppHandle) -> Result<(), String> {
    let dir = custom_images_dir(&app).map_err(|e| e.to_string())?;
    app.opener().reveal_item_in_dir(dir).map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_obs_popout(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay-popout") {
        return window.set_focus().map_err(|e| e.to_string());
    }

    WebviewWindowBuilder::new(
        &app,
        "overlay-popout",
        WebviewUrl::App("index.html#/overlay-popout".into()),
    )
    .title("OBS Overlay")
    .resizable(true)
    .inner_size(1280.0, 720.0)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn create_overlay(app: &tauri::AppHandle) -> tauri::Result<()> {
    let monitor = app
        .primary_monitor()?
        .expect("no primary monitor found");

    let size = monitor.size();
    let position = monitor.position();

    let overlay = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("index.html#/overlay".into()))
        .title("Overlay")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .position(position.x as f64, position.y as f64)
        .inner_size(size.width as f64, size.height as f64)
        .build()?;

    overlay.set_ignore_cursor_events(true)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = app.emit("trigger-scan", ());
                    }
                })
                .build(),
        )
        .manage(MapsSyncStateStore(std::sync::Mutex::new(MapsSyncState {
            phase: "checking".to_string(),
            current: 0,
            total: 0,
            error: None,
        })))
        .invoke_handler(tauri::generate_handler![
            list_gallery_images,
            list_capturable_windows,
            capture_screen_region,
            open_obs_popout,
            open_custom_maps_folder,
            get_maps_sync_status,
            set_scan_shortcut,
            is_portable
        ])
        .setup(|app| {
            images_dir(app.handle())?;
            custom_images_dir(app.handle())?;
            create_overlay(app.handle())?;
            // Ctrl+O is a systemwide hotkey, so a second running instance can't
            // claim it - don't let that failure take down the whole instance.
            if let Err(e) = app.global_shortcut().register("CommandOrControl+O") {
                eprintln!("failed to register global shortcut (already running elsewhere?): {e}");
            }
            let app_handle = app.handle().clone();
            std::thread::spawn(move || sync_maps_with_repo(&app_handle));
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { .. } = event {
                    if let Some(overlay) = window.app_handle().get_webview_window("overlay") {
                        let _ = overlay.close();
                    }
                    if let Some(popout) = window.app_handle().get_webview_window("overlay-popout") {
                        let _ = popout.close();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
