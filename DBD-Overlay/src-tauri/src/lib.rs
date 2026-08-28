use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use percent_encoding::{AsciiSet, NON_ALPHANUMERIC};
use serde::{Deserialize, Serialize};
use std::fs;
use std::time::Duration;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
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

    for path in files {
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

// Runs on startup on a background thread: checks the latest commit touching
// Maps/ in the repo and, if it differs from the sha we last downloaded,
// replaces the local map pack. Failures (offline, rate-limited, etc.) are
// logged and otherwise ignored so a bad network doesn't block startup or
// disturb whatever maps are already on disk.
fn sync_maps_with_repo(app: &tauri::AppHandle) {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(20)))
        .user_agent("dbd-toolbox")
        .build()
        .into();

    let latest_sha = match latest_maps_commit_sha(&agent) {
        Ok(sha) => sha,
        Err(e) => {
            eprintln!("failed to check for map updates: {e}");
            return;
        }
    };

    let version_path = match maps_version_file(app) {
        Ok(path) => path,
        Err(e) => {
            eprintln!("failed to resolve maps-version.json path: {e}");
            return;
        }
    };

    let stored_sha = fs::read_to_string(&version_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<MapsVersion>(&raw).ok())
        .map(|v| v.sha);

    if stored_sha.as_deref() == Some(latest_sha.as_str()) {
        return;
    }

    if let Err(e) = replace_maps(app, &agent, &latest_sha, &version_path) {
        eprintln!("failed to download map updates: {e}");
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

#[tauri::command]
fn list_gallery_images(app: tauri::AppHandle) -> Result<Vec<GalleryImage>, String> {
    let root = images_dir(&app).map_err(|e| e.to_string())?;
    let mut images: Vec<GalleryImage> = Vec::new();

    for creator_entry in fs::read_dir(&root)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
    {
        let creator_path = creator_entry.path();
        if !creator_path.is_dir() {
            continue;
        }
        let creator = dir_name_string(&creator_path);

        for sub_entry in fs::read_dir(&creator_path)
            .map_err(|e| e.to_string())?
            .filter_map(|entry| entry.ok())
        {
            let sub_path = sub_entry.path();
            if sub_path.is_dir() {
                let family = dir_name_string(&sub_path);
                collect_family_images(&sub_path, &creator, &family, &mut images)
                    .map_err(|e| e.to_string())?;
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

    images.sort_by(|a, b| {
        a.creator
            .cmp(&b.creator)
            .then(a.family.cmp(&b.family))
            .then(a.name.cmp(&b.name))
    });

    Ok(images)
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
#[tauri::command]
fn capture_screen_region(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    window_title: String,
    brightness_threshold: u8,
) -> Result<String, String> {
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

    let px = (x.clamp(0.0, 1.0) * win_width as f64) as u32;
    let py = (y.clamp(0.0, 1.0) * win_height as f64) as u32;
    let pw = (width.clamp(0.0, 1.0) * win_width as f64)
        .max(1.0)
        .min((win_width.saturating_sub(px)) as f64) as u32;
    let ph = (height.clamp(0.0, 1.0) * win_height as f64)
        .max(1.0)
        .min((win_height.saturating_sub(py)) as f64) as u32;

    let cropped = image::imageops::crop(&mut image, px, py, pw, ph).to_image();

    // Map names render as solid light text over a translucent bar, but the
    // game background behind/around it is busy and confuses the OCR engine
    // into "reading" nonsense. Crushing the crop to grayscale then to pure
    // black/white isolates the bright text and drops most of that noise.
    let mut gray = image::DynamicImage::ImageRgba8(cropped).to_luma8();
    for pixel in gray.pixels_mut() {
        pixel[0] = if pixel[0] >= brightness_threshold { 255 } else { 0 };
    }

    let mut buf: Vec<u8> = Vec::new();
    image::DynamicImage::ImageLuma8(gray)
        .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    Ok(format!("data:image/png;base64,{}", BASE64.encode(&buf)))
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
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = app.emit("trigger-scan", ());
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            list_gallery_images,
            list_capturable_windows,
            capture_screen_region,
            open_obs_popout
        ])
        .setup(|app| {
            images_dir(app.handle())?;
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
