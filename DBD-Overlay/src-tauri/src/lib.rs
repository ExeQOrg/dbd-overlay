use serde::Serialize;
use std::fs;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

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
        .invoke_handler(tauri::generate_handler![greet, list_gallery_images])
        .setup(|app| {
            images_dir(app.handle())?;
            create_overlay(app.handle())?;
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
