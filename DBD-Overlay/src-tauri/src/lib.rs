use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::Serialize;
use std::fs;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use xcap::Window;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Serialize, Clone)]
struct GalleryImage {
    name: String,
    path: String,
}

const IMAGE_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

fn images_dir(app: &tauri::AppHandle) -> tauri::Result<std::path::PathBuf> {
    let dir = app.path().app_data_dir()?.join("maps");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

#[tauri::command]
fn list_gallery_images(app: tauri::AppHandle) -> Result<Vec<GalleryImage>, String> {
    let dir = images_dir(&app).map_err(|e| e.to_string())?;

    let mut images: Vec<GalleryImage> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_file())
        .filter(|entry| {
            entry
                .path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| IMAGE_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
                .unwrap_or(false)
        })
        .map(|entry| {
            let path = entry.path();
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string();
            GalleryImage {
                name,
                path: path.to_string_lossy().to_string(),
            }
        })
        .collect();

    images.sort_by(|a, b| a.name.cmp(&b.name));

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
const OWN_WINDOW_TITLES: [&str; 2] = ["dbd-overlay", "Overlay"];

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
) -> Result<String, String> {
    let windows = Window::all().map_err(|e| e.to_string())?;
    let window = windows
        .into_iter()
        .find(|w| w.title().map(|t| t == window_title).unwrap_or(false))
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

    let mut buf: Vec<u8> = Vec::new();
    image::DynamicImage::ImageRgba8(cropped)
        .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    Ok(format!("data:image/png;base64,{}", BASE64.encode(&buf)))
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
            greet,
            list_gallery_images,
            list_capturable_windows,
            capture_screen_region
        ])
        .setup(|app| {
            images_dir(app.handle())?;
            create_overlay(app.handle())?;
            app.global_shortcut().register("CommandOrControl+O")?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { .. } = event {
                    if let Some(overlay) = window.app_handle().get_webview_window("overlay") {
                        let _ = overlay.close();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
