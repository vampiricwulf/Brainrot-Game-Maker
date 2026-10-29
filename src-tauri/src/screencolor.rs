//! The 💧 beside a color box (desktop app, Windows): pick a color from anywhere on the screen. The color popup's own
//! eyedropper does nothing in WebView2 on some PCs, so the app has its own: a still picture of every screen, with a
//! cross cursor and a magnifier showing the pixels around it and the color's #rrggbb. A click (or Enter or Space)
//! picks the pixel under the cursor, the arrow keys move it one pixel (ten with Shift), and Esc, a right click or
//! switching to another window cancels.
//!
//! Everything is in physical pixels, on every screen: tao makes the process per-monitor DPI aware (v2) as its event
//! loop starts, before any window or command, so the cursor, the screens' sizes and the picture all agree.

// (Only the Windows picker uses the helpers; elsewhere just the tests do.)
#![cfg_attr(not(windows), allow(dead_code))]

/// How many screen pixels across the magnifier shows (odd, so one is in the middle).
const ZOOM_PIXELS: i32 = 11;
/// Sizes at 100% display scaling: one screen pixel in the magnifier, its border, the color line under it, the
/// magnifier's distance from the cursor, and the #rrggbb's letters.
const CELL: i32 = 10;
const BORDER: i32 = 2;
const LABEL: i32 = 26;
const GAP: i32 = 24;
const TEXT: i32 = 15;

/// A rectangle in screen (or window) pixels; `right` and `bottom` are just outside it.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct Rect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

impl Rect {
    fn at(left: i32, top: i32, width: i32, height: i32) -> Rect {
        Rect { left, top, right: left + width, bottom: top + height }
    }

    fn width(self) -> i32 {
        self.right - self.left
    }

    fn height(self) -> i32 {
        self.bottom - self.top
    }

    fn offset(self, x: i32, y: i32) -> Rect {
        Rect::at(self.left + x, self.top + y, self.width(), self.height())
    }

    /// Grown by `by` on every side.
    fn inflate(self, by: i32) -> Rect {
        Rect { left: self.left - by, top: self.top - by, right: self.right + by, bottom: self.bottom + by }
    }

    fn overlaps(self, other: Rect) -> bool {
        self.left < other.right && other.left < self.right && self.top < other.bottom && other.top < self.bottom
    }
}

/// The magnifier's sizes on a screen of `dpi` (96 at 100% scaling).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Sizes {
    cell: i32,
    border: i32,
    label: i32,
    gap: i32,
    text: i32,
}

impl Sizes {
    fn at_dpi(dpi: u32) -> Sizes {
        let dpi = dpi.clamp(48, 960) as i32;
        let scale = |size: i32| ((size * dpi + 48) / 96).max(1);
        Sizes { cell: scale(CELL), border: scale(BORDER), label: scale(LABEL), gap: scale(GAP), text: scale(TEXT) }
    }

    /// The whole magnifier's width and height: the pixels, then the color line, inside a border.
    fn outer(self) -> (i32, i32) {
        let grid = ZOOM_PIXELS * self.cell;
        (grid + 2 * self.border, grid + self.label + 3 * self.border)
    }
}

/// Where a magnifier of `size` goes (its top left corner) for the cursor at `at`: below and right of it, or on the
/// other side where that would run off `screen` (the cursor's own screen), and always on it.
fn loupe_at(at: (i32, i32), size: (i32, i32), gap: i32, screen: Rect) -> (i32, i32) {
    let place = |at: i32, size: i32, start: i32, end: i32| {
        let after = at + gap;
        let spot = if after + size > end { at - gap - size } else { after };
        // (A screen smaller than the magnifier gets it at its start.)
        spot.min(end - size).max(start)
    };
    (place(at.0, size.0, screen.left, screen.right), place(at.1, size.1, screen.top, screen.bottom))
}

/// Where screen pixel `at` is in a top-down picture of `size` whose top left pixel is screen pixel `origin` (screens
/// left of or above the main one have negative coordinates). None outside the picture.
fn pixel_index(at: (i32, i32), origin: (i32, i32), size: (i32, i32)) -> Option<usize> {
    let x = usize::try_from(i64::from(at.0) - i64::from(origin.0)).ok()?;
    let y = usize::try_from(i64::from(at.1) - i64::from(origin.1)).ok()?;
    let (width, height) = (usize::try_from(size.0).ok()?, usize::try_from(size.1).ok()?);
    (x < width && y < height).then(|| y * width + x)
}

/// A pixel as the picture holds it (blue, green, red and an unused byte, read as one little-endian number), as
/// "#rrggbb".
fn hex(pixel: u32) -> String {
    format!("#{:06x}", pixel & 0x00ff_ffff)
}

/// The same pixel as a GDI color (0x00bbggrr).
fn colorref(pixel: u32) -> u32 {
    ((pixel & 0xff) << 16) | (pixel & 0xff00) | ((pixel >> 16) & 0xff)
}

/// The cursor at `at` moved by `by` (an arrow key), kept on the `desktop`.
fn nudge(at: (i32, i32), by: (i32, i32), desktop: Rect) -> (i32, i32) {
    let keep = |v: i32, start: i32, end: i32| v.min(end - 1).max(start);
    (
        keep(at.0.saturating_add(by.0), desktop.left, desktop.right),
        keep(at.1.saturating_add(by.1), desktop.top, desktop.bottom),
    )
}

/// Pick a color from the screen (the 💧 beside a color box): "#rrggbb", or nothing if the host cancelled. Afterwards
/// the window that asked gets the keys back (Windows would give them to whatever window was under the picker).
#[tauri::command]
pub async fn pick_screen_color(window: tauri::WebviewWindow) -> Result<Option<String>, String> {
    let picked = pick().await;
    let _ = window.set_focus();
    picked
}

#[cfg(not(windows))]
async fn pick() -> Result<Option<String>, String> {
    Err("Picking a color from the screen only works in the Windows app.".into())
}

#[cfg(windows)]
async fn pick() -> Result<Option<String>, String> {
    let picking = win::Picking::start()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _picking = picking;
        // SAFETY: a thread of the blocking pool, which has no windows of its own; the picker's window is closed
        // before run() returns.
        unsafe { win::run() }
    })
    .await
    // (A panic's own text says nothing to a host.)
    .map_err(|_| "The color picker stopped: something went wrong in the app. Try again.".to_string())?
}

/// The picker itself. It runs on one thread, with its own window and message loop, and frees every handle it makes
/// on the way out, whatever ends it.
#[cfg(windows)]
mod win {
    use super::{colorref, hex, loupe_at, nudge, pixel_index, Rect, Sizes, ZOOM_PIXELS};
    use std::cell::Cell;
    use std::panic::{catch_unwind, AssertUnwindSafe};
    use std::ptr::{null, null_mut};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::OnceLock;
    use std::time::{Duration, Instant};
    use windows_sys::core::{HRESULT, PCWSTR};
    use windows_sys::w;
    use windows_sys::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
    use windows_sys::Win32::Graphics::Gdi::{
        BeginPaint, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateDIBSection, CreateFontW, DeleteDC,
        DeleteObject, DrawTextW, EndPaint, FillRect, GdiFlush, GetDC, GetMonitorInfoW, GetStockObject,
        InvalidateRect, MonitorFromPoint, ReleaseDC, SelectObject, SetBkMode, SetDCBrushColor, SetTextColor,
        UpdateWindow, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT, CLEARTYPE_QUALITY, CLIP_DEFAULT_PRECIS,
        DC_BRUSH, DEFAULT_CHARSET, DEFAULT_PITCH, DIB_RGB_COLORS, DT_NOPREFIX, DT_SINGLELINE, DT_VCENTER,
        FW_SEMIBOLD, HDC, HGDIOBJ, HMONITOR, MONITORINFO, MONITOR_DEFAULTTONEAREST, OUT_DEFAULT_PRECIS, PAINTSTRUCT,
        SRCCOPY, TRANSPARENT,
    };
    use windows_sys::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress, LoadLibraryW};
    use windows_sys::Win32::UI::HiDpi::{MDT_EFFECTIVE_DPI, MONITOR_DPI_TYPE};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetKeyState, VK_DOWN, VK_ESCAPE, VK_LEFT, VK_RETURN, VK_RIGHT, VK_SHIFT, VK_SPACE, VK_UP,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetCursorPos, GetMessageW,
        GetSystemMetrics, GetWindowLongPtrW, LoadCursorW, RegisterClassExW, SetCursor, SetCursorPos,
        SetForegroundWindow, SetWindowLongPtrW, ShowWindow, TranslateMessage, CREATESTRUCTW, GWLP_USERDATA,
        IDC_CROSS, MSG, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SW_SHOW,
        WA_INACTIVE, WM_ACTIVATE, WM_CLOSE, WM_DISPLAYCHANGE, WM_ERASEBKGND, WM_KEYDOWN, WM_LBUTTONDOWN,
        WM_LBUTTONUP, WM_MOUSEMOVE, WM_NCCREATE, WM_NCDESTROY, WM_PAINT, WM_RBUTTONUP, WNDCLASSEXW,
        WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
    };

    /// A click this soon after the picker opens is the one that opened it (or the second half of a double click).
    const CLICK_DELAY: Duration = Duration::from_millis(300);

    const CLASS: PCWSTR = w!("BrainrotGamesMakerScreenColor");
    /// The window class is registered by the first pick.
    static REGISTERED: AtomicBool = AtomicBool::new(false);

    // GDI colors (0x00bbggrr): the magnifier's frame, pixels off every screen, its outline and letters.
    const FRAME: u32 = 0x0020_2020;
    const OFF_SCREEN: u32 = 0x0040_4040;
    const WHITE: u32 = 0x00ff_ffff;
    const BLACK: u32 = 0;

    /// Only one picker at a time: another 💧 meanwhile is told so.
    static PICKING: AtomicBool = AtomicBool::new(false);

    /// Holds the one picker's place; lets it go when dropped.
    pub struct Picking;

    impl Picking {
        pub fn start() -> Result<Picking, String> {
            PICKING
                .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                .map(|_| Picking)
                .map_err(|_| "The color picker is already open.".to_string())
        }
    }

    impl Drop for Picking {
        fn drop(&mut self) {
            PICKING.store(false, Ordering::SeqCst);
        }
    }

    impl From<RECT> for Rect {
        fn from(r: RECT) -> Rect {
            Rect { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
        }
    }

    impl From<Rect> for RECT {
        fn from(r: Rect) -> RECT {
            RECT { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
        }
    }

    /// A GDI object made here, deleted when dropped.
    struct GdiObject(HGDIOBJ);

    impl Drop for GdiObject {
        fn drop(&mut self) {
            if !self.0.is_null() {
                // SAFETY: made here, and no longer selected into a DC (see Selected).
                unsafe { DeleteObject(self.0) };
            }
        }
    }

    /// A memory DC, deleted when dropped.
    struct MemoryDc(HDC);

    impl Drop for MemoryDc {
        fn drop(&mut self) {
            if !self.0.is_null() {
                // SAFETY: made here with CreateCompatibleDC.
                unsafe { DeleteDC(self.0) };
            }
        }
    }

    /// The whole screen's DC, given back when dropped.
    struct ScreenDc(HDC);

    impl Drop for ScreenDc {
        fn drop(&mut self) {
            if !self.0.is_null() {
                // SAFETY: from GetDC(null).
                unsafe { ReleaseDC(null_mut(), self.0) };
            }
        }
    }

    /// An object selected into a DC, taken out again when dropped (before the object itself is deleted).
    struct Selected {
        dc: HDC,
        old: HGDIOBJ,
    }

    impl Selected {
        unsafe fn new(dc: HDC, object: HGDIOBJ) -> Selected {
            Selected { dc, old: SelectObject(dc, object) }
        }
    }

    impl Drop for Selected {
        fn drop(&mut self) {
            if !self.old.is_null() {
                // SAFETY: puts back what the DC had before.
                unsafe { SelectObject(self.dc, self.old) };
            }
        }
    }

    /// The picker's window, closed when dropped.
    struct Window(HWND);

    impl Drop for Window {
        fn drop(&mut self) {
            // SAFETY: made on this thread by run().
            unsafe { DestroyWindow(self.0) };
        }
    }

    /// A still picture of every screen: the picker shows it and reads the picked pixel from it.
    struct Snapshot {
        // (Dropped in this order: the bitmap comes out of the DC before either is deleted.)
        _selected: Selected,
        dc: MemoryDc,
        _bitmap: GdiObject,
        /// Its pixels, top row first.
        bits: *const u32,
        /// The screens it shows, in screen pixels (the window covers the same).
        desktop: Rect,
    }

    impl Snapshot {
        /// Every screen (the whole virtual desktop) as it is now.
        unsafe fn take() -> Option<Snapshot> {
            let desktop = Rect::at(
                GetSystemMetrics(SM_XVIRTUALSCREEN),
                GetSystemMetrics(SM_YVIRTUALSCREEN),
                GetSystemMetrics(SM_CXVIRTUALSCREEN),
                GetSystemMetrics(SM_CYVIRTUALSCREEN),
            );
            if desktop.width() <= 0 || desktop.height() <= 0 {
                return None;
            }
            let screen = ScreenDc(GetDC(null_mut()));
            if screen.0.is_null() {
                return None;
            }
            let dc = MemoryDc(CreateCompatibleDC(screen.0));
            if dc.0.is_null() {
                return None;
            }
            // Top-down (a negative height), 32 bits a pixel: pixel (x, y) is number y × width + x.
            let info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: desktop.width(),
                    biHeight: -desktop.height(),
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut bits = null_mut();
            let bitmap = GdiObject(CreateDIBSection(dc.0, &info, DIB_RGB_COLORS, &mut bits, null_mut(), 0));
            if bitmap.0.is_null() || bits.is_null() {
                return None;
            }
            let selected = Selected::new(dc.0, bitmap.0);
            // CAPTUREBLT: windows drawn over others (tooltips, overlays) are in the picture too.
            let (w, h) = (desktop.width(), desktop.height());
            if BitBlt(dc.0, 0, 0, w, h, screen.0, desktop.left, desktop.top, SRCCOPY | CAPTUREBLT) == 0 {
                return None;
            }
            // (The pixels are read straight from memory: GDI must have finished writing them.)
            GdiFlush();
            Some(Snapshot { _selected: selected, dc, _bitmap: bitmap, bits: bits.cast(), desktop })
        }

        /// The pixel at screen pixel `at`, if it's in the picture.
        fn pixel(&self, at: (i32, i32)) -> Option<u32> {
            let d = self.desktop;
            let i = pixel_index(at, (d.left, d.top), (d.width(), d.height()))?;
            // SAFETY: pixel_index keeps `i` inside the width × height pixels at `bits`, which live as long as self.
            Some(unsafe { self.bits.add(i).read() })
        }
    }

    /// One pick: the picture, and what the host has done so far. The window procedure only ever has a shared
    /// reference to it, so everything that changes is a Cell.
    struct Picker {
        shot: Snapshot,
        opened: Instant,
        /// The cursor, in screen pixels.
        at: Cell<(i32, i32)>,
        /// Where the magnifier was last put (window pixels): the picture is drawn back there when it moves.
        drawn: Cell<Rect>,
        /// The left button went down on the picture (after CLICK_DELAY), so letting go picks.
        pressed: Cell<bool>,
        /// Set once it's over: the pixel picked, or None when cancelled.
        outcome: Cell<Option<Option<u32>>>,
    }

    impl Picker {
        /// The first outcome counts (closing the window afterwards deactivates it, which would cancel).
        fn finish(&self, outcome: Option<u32>) {
            if self.outcome.get().is_none() {
                self.outcome.set(Some(outcome));
            }
        }

        unsafe fn pick(&self) {
            self.finish(self.shot.pixel(cursor(self.at.get())));
        }

        fn cancel(&self) {
            self.finish(None);
        }

        /// The magnifier for the cursor at `at`, in window pixels, with its sizes on that screen.
        unsafe fn loupe(&self, at: (i32, i32)) -> (Rect, Sizes) {
            let monitor = MonitorFromPoint(POINT { x: at.0, y: at.1 }, MONITOR_DEFAULTTONEAREST);
            let mut info = MONITORINFO { cbSize: size_of::<MONITORINFO>() as u32, ..Default::default() };
            let screen = if GetMonitorInfoW(monitor, &mut info) != 0 { info.rcMonitor.into() } else { self.shot.desktop };
            let sizes = Sizes::at_dpi(monitor_dpi(monitor));
            let (w, h) = sizes.outer();
            let (x, y) = loupe_at(at, (w, h), sizes.gap, screen);
            let d = self.shot.desktop;
            (Rect::at(x - d.left, y - d.top, w, h), sizes)
        }

        /// The cursor is at `at` now: the picture goes back where the magnifier was, and the magnifier where it is.
        unsafe fn moved(&self, hwnd: HWND, at: (i32, i32)) {
            self.at.set(at);
            let (now, _) = self.loupe(at);
            InvalidateRect(hwnd, &self.drawn.get().into(), 0);
            InvalidateRect(hwnd, &now.into(), 0);
            self.drawn.set(now);
        }
    }

    /// Where the cursor is (screen pixels), or `last` if Windows won't say.
    unsafe fn cursor(last: (i32, i32)) -> (i32, i32) {
        let mut point = POINT::default();
        if GetCursorPos(&mut point) != 0 {
            (point.x, point.y)
        } else {
            last
        }
    }

    /// A screen's DPI (96 at 100% scaling). GetDpiForMonitor is looked up when first needed, as tao does, so the
    /// app still starts on a Windows without it.
    unsafe fn monitor_dpi(monitor: HMONITOR) -> u32 {
        type GetDpiForMonitor = unsafe extern "system" fn(HMONITOR, MONITOR_DPI_TYPE, *mut u32, *mut u32) -> HRESULT;
        static FUNCTION: OnceLock<Option<GetDpiForMonitor>> = OnceLock::new();
        let function = *FUNCTION.get_or_init(|| {
            let library = LoadLibraryW(w!("shcore.dll"));
            if library.is_null() {
                return None;
            }
            GetProcAddress(library, c"GetDpiForMonitor".as_ptr().cast())
                .map(|f| std::mem::transmute::<unsafe extern "system" fn() -> isize, GetDpiForMonitor>(f))
        });
        let (mut x, mut y) = (96, 96);
        match function {
            Some(get) if get(monitor, MDT_EFFECTIVE_DPI, &mut x, &mut y) >= 0 => x,
            _ => 96,
        }
    }

    unsafe fn fill(dc: HDC, r: Rect, color: u32) {
        SetDCBrushColor(dc, color);
        FillRect(dc, &r.into(), GetStockObject(DC_BRUSH));
    }

    /// A line `width` wide just inside `r`.
    unsafe fn outline(dc: HDC, r: Rect, width: i32, color: u32) {
        fill(dc, Rect { bottom: r.top + width, ..r }, color);
        fill(dc, Rect { top: r.bottom - width, ..r }, color);
        fill(dc, Rect { right: r.left + width, ..r }, color);
        fill(dc, Rect { left: r.right - width, ..r }, color);
    }

    /// One line of white text in `r`, centred up and down, `height` pixels tall.
    unsafe fn text(dc: HDC, words: &str, r: Rect, height: i32) {
        let font = GdiObject(CreateFontW(
            -height,
            0,
            0,
            0,
            FW_SEMIBOLD as i32,
            0,
            0,
            0,
            DEFAULT_CHARSET.into(),
            OUT_DEFAULT_PRECIS.into(),
            CLIP_DEFAULT_PRECIS.into(),
            CLEARTYPE_QUALITY.into(),
            DEFAULT_PITCH.into(),
            w!("Segoe UI"),
        ));
        let _font = (!font.0.is_null()).then(|| Selected::new(dc, font.0));
        SetBkMode(dc, TRANSPARENT as i32);
        SetTextColor(dc, WHITE);
        let letters: Vec<u16> = words.encode_utf16().collect();
        let mut rect = r.into();
        DrawTextW(dc, letters.as_ptr(), letters.len() as i32, &mut rect, DT_SINGLELINE | DT_VCENTER | DT_NOPREFIX);
    }

    /// The magnifier at `r` (in `dc`'s pixels): the pixels around the cursor with the middle one outlined, and under
    /// them a swatch of that color and its #rrggbb.
    unsafe fn draw_loupe(p: &Picker, dc: HDC, r: Rect, s: Sizes) {
        fill(dc, r, FRAME);
        let (x, y) = p.at.get();
        let half = ZOOM_PIXELS / 2;
        let side = ZOOM_PIXELS * s.cell;
        let grid = Rect::at(r.left + s.border, r.top + s.border, side, side);
        for row in 0..ZOOM_PIXELS {
            for col in 0..ZOOM_PIXELS {
                let pixel = p.shot.pixel((x - half + col, y - half + row));
                let cell = Rect::at(grid.left + col * s.cell, grid.top + row * s.cell, s.cell, s.cell);
                fill(dc, cell, pixel.map_or(OFF_SCREEN, colorref));
            }
        }
        // White, then black around it, so it shows on any color.
        let middle = Rect::at(grid.left + half * s.cell, grid.top + half * s.cell, s.cell, s.cell);
        let line = (s.border / 2).max(1);
        outline(dc, middle.inflate(line), line, WHITE);
        outline(dc, middle.inflate(2 * line), line, BLACK);
        let Some(picked) = p.shot.pixel((x, y)) else {
            return;
        };
        let label = Rect::at(grid.left, grid.bottom + s.border, side, s.label);
        let pad = (s.label / 5).max(1);
        let swatch = Rect::at(label.left + pad, label.top + pad, s.label - 2 * pad, s.label - 2 * pad);
        fill(dc, swatch, colorref(picked));
        outline(dc, swatch, 1, WHITE);
        text(dc, &hex(picked), Rect { left: swatch.right + 2 * pad, ..label }, s.text);
    }

    /// A memory bitmap to draw in before it's copied to the window in one go (no flicker).
    struct Buffer {
        // (Dropped in this order, as for Snapshot.)
        _selected: Selected,
        dc: MemoryDc,
        _bitmap: GdiObject,
    }

    impl Buffer {
        unsafe fn new(like: HDC, w: i32, h: i32) -> Option<Buffer> {
            let dc = MemoryDc(CreateCompatibleDC(like));
            if dc.0.is_null() {
                return None;
            }
            let bitmap = GdiObject(CreateCompatibleBitmap(like, w, h));
            if bitmap.0.is_null() {
                return None;
            }
            Some(Buffer { _selected: Selected::new(dc.0, bitmap.0), dc, _bitmap: bitmap })
        }
    }

    /// Draw `area` of the window (window pixels): the picture, and the magnifier over it.
    unsafe fn draw(p: &Picker, dc: HDC, area: Rect) {
        let (w, h) = (area.width(), area.height());
        if w <= 0 || h <= 0 {
            return;
        }
        // (Without the memory for a buffer, straight onto the window.)
        let buffer = Buffer::new(dc, w, h);
        let (target, origin) = match &buffer {
            Some(b) => (b.dc.0, (area.left, area.top)),
            None => (dc, (0, 0)),
        };
        // The window shows the picture pixel for pixel: window pixel (0, 0) is the desktop's top left.
        BitBlt(target, area.left - origin.0, area.top - origin.1, w, h, p.shot.dc.0, area.left, area.top, SRCCOPY);
        let (loupe, sizes) = p.loupe(p.at.get());
        if loupe.overlaps(area) {
            draw_loupe(p, target, loupe.offset(-origin.0, -origin.1), sizes);
        }
        if let Some(b) = &buffer {
            BitBlt(dc, area.left, area.top, w, h, b.dc.0, 0, 0, SRCCOPY);
        }
    }

    unsafe fn paint(p: &Picker, hwnd: HWND) {
        let mut ps = PAINTSTRUCT::default();
        let dc = BeginPaint(hwnd, &mut ps);
        if !dc.is_null() {
            draw(p, dc, ps.rcPaint.into());
        }
        EndPaint(hwnd, &ps);
    }

    /// Enter or Space picks, Esc cancels, the arrow keys move the cursor a pixel (ten with Shift).
    unsafe fn key(p: &Picker, hwnd: HWND, vk: u16, lparam: LPARAM) -> Option<LRESULT> {
        // (Bit 30: the key was already down, held since before the picker opened or repeating.)
        let fresh = lparam & (1 << 30) == 0;
        let step = if GetKeyState(VK_SHIFT.into()) < 0 { 10 } else { 1 };
        let by = match vk {
            VK_ESCAPE => {
                p.cancel();
                return Some(0);
            }
            VK_RETURN | VK_SPACE => {
                if fresh {
                    p.pick();
                }
                return Some(0);
            }
            VK_LEFT => (-step, 0),
            VK_RIGHT => (step, 0),
            VK_UP => (0, -step),
            VK_DOWN => (0, step),
            _ => return None,
        };
        let to = nudge(cursor(p.at.get()), by, p.shot.desktop);
        SetCursorPos(to.0, to.1);
        p.moved(hwnd, cursor(to));
        Some(0)
    }

    /// What the picker does with a message; None leaves it to Windows.
    unsafe fn handle(p: &Picker, hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> Option<LRESULT> {
        match msg {
            WM_PAINT => paint(p, hwnd),
            // (The picture covers the whole window: nothing to erase first.)
            WM_ERASEBKGND => return Some(1),
            WM_MOUSEMOVE => p.moved(hwnd, cursor(p.at.get())),
            WM_LBUTTONDOWN => p.pressed.set(p.opened.elapsed() >= CLICK_DELAY),
            WM_LBUTTONUP if p.pressed.get() => p.pick(),
            // On letting go, so the page under the picker gets no right click (its menu would open).
            WM_RBUTTONUP => p.cancel(),
            WM_KEYDOWN => return key(p, hwnd, wparam as u16, lparam),
            WM_ACTIVATE if (wparam & 0xffff) as u32 == WA_INACTIVE => p.cancel(),
            // (WM_DISPLAYCHANGE: the screens changed, so the picture no longer matches them.)
            WM_CLOSE | WM_DISPLAYCHANGE => p.cancel(),
            _ => return None,
        }
        Some(0)
    }

    unsafe extern "system" fn window_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if msg == WM_NCCREATE {
            // SAFETY: WM_NCCREATE's lparam is the CREATESTRUCTW, and its lpCreateParams the Picker run() made.
            let create = lparam as *const CREATESTRUCTW;
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, (*create).lpCreateParams as isize);
        } else if msg == WM_NCDESTROY {
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
        } else {
            // SAFETY: the Picker outlives the window (run() closes it first), and is only ever shared.
            let picker = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *const Picker;
            if let Some(p) = picker.as_ref() {
                // A panic must not reach Windows (it would end the app): it cancels the pick instead.
                match catch_unwind(AssertUnwindSafe(|| handle(p, hwnd, msg, wparam, lparam))) {
                    Ok(Some(result)) => return result,
                    Ok(None) => {}
                    Err(_) => {
                        p.cancel();
                        return 0;
                    }
                }
            }
        }
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    unsafe fn register(instance: HINSTANCE) -> bool {
        if REGISTERED.load(Ordering::SeqCst) {
            return true;
        }
        let class = WNDCLASSEXW {
            cbSize: size_of::<WNDCLASSEXW>() as u32,
            lpfnWndProc: Some(window_proc),
            hInstance: instance,
            hCursor: LoadCursorW(null_mut(), IDC_CROSS),
            lpszClassName: CLASS,
            ..Default::default()
        };
        let registered = RegisterClassExW(&class) != 0;
        REGISTERED.store(registered, Ordering::SeqCst);
        registered
    }

    /// Open the picker and wait for the host: the color picked, or None if they cancelled.
    ///
    /// SAFETY: on a thread with no windows of its own (the picker runs its own message loop on it), holding Picking.
    pub unsafe fn run() -> Result<Option<String>, String> {
        let cant_open = || "Couldn't open the color picker. Try again.".to_string();
        let instance = GetModuleHandleW(null());
        if !register(instance) {
            return Err(cant_open());
        }
        let shot = Snapshot::take().ok_or("Couldn't see the screen to pick a color from. Try again.")?;
        let desktop = shot.desktop;
        let at = cursor((desktop.left, desktop.top));
        let picker = Picker {
            shot,
            opened: Instant::now(),
            at: Cell::new(at),
            drawn: Cell::new(Rect::default()),
            pressed: Cell::new(false),
            outcome: Cell::new(None),
        };
        picker.drawn.set(picker.loupe(at).0);
        let hwnd = CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
            CLASS,
            w!("Pick a color"),
            WS_POPUP,
            desktop.left,
            desktop.top,
            desktop.width(),
            desktop.height(),
            null_mut(),
            null_mut(),
            instance,
            (&picker as *const Picker).cast(),
        );
        if hwnd.is_null() {
            return Err(cant_open());
        }
        // (Closed before `picker` goes, since the window procedure reads it until then.)
        let _window = Window(hwnd);
        ShowWindow(hwnd, SW_SHOW);
        SetForegroundWindow(hwnd);
        SetCursor(LoadCursorW(null_mut(), IDC_CROSS));
        UpdateWindow(hwnd);
        let mut msg = MSG::default();
        while picker.outcome.get().is_none() {
            // (0: the thread was told to quit; -1: something went wrong. Either way, that's a cancel.)
            if GetMessageW(&mut msg, null_mut(), 0, 0) <= 0 {
                break;
            }
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        Ok(picker.outcome.get().flatten().map(hex))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pixels_read_as_rrggbb() {
        // Blue, green, red, then the unused byte.
        let pixel = u32::from_le_bytes([0x34, 0xab, 0x12, 0xff]);
        assert_eq!(hex(pixel), "#12ab34");
        assert_eq!(hex(u32::from_le_bytes([0x34, 0xab, 0x12, 0])), "#12ab34");
        assert_eq!(hex(0), "#000000");
        assert_eq!(colorref(pixel), 0x0034_ab12);
    }

    #[test]
    fn pixel_index_follows_the_desktop() {
        // A screen left of the main one: the desktop starts at x = -1920.
        let (origin, size) = ((-1920, 0), (3840, 1080));
        assert_eq!(pixel_index((-1920, 0), origin, size), Some(0));
        assert_eq!(pixel_index((0, 0), origin, size), Some(1920));
        assert_eq!(pixel_index((5, 2), origin, size), Some(2 * 3840 + 1925));
        assert_eq!(pixel_index((1919, 1079), origin, size), Some(3840 * 1080 - 1));
        for outside in [(1920, 0), (-1921, 0), (0, 1080), (0, -1), (i32::MIN, i32::MAX)] {
            assert_eq!(pixel_index(outside, origin, size), None, "{outside:?}");
        }
        // A screen above the main one.
        assert_eq!(pixel_index((10, -1080), (0, -1080), (1920, 2160)), Some(10));
    }

    #[test]
    fn sizes_follow_the_screens_scaling() {
        let normal = Sizes::at_dpi(96);
        assert_eq!(normal, Sizes { cell: 10, border: 2, label: 26, gap: 24, text: 15 });
        assert_eq!(normal.outer(), (114, 142));
        let big = Sizes::at_dpi(144);
        assert_eq!(big.cell, 15);
        assert_eq!(big.outer(), (11 * 15 + 2 * 3, 11 * 15 + 39 + 3 * 3));
        assert_eq!(Sizes::at_dpi(0), Sizes::at_dpi(48));
    }

    #[test]
    fn loupe_stays_on_the_cursors_screen() {
        let screen = Rect { left: 0, top: 0, right: 1920, bottom: 1080 };
        let size = (114, 142);
        assert_eq!(loupe_at((100, 100), size, 24, screen), (124, 124));
        // Near the right or bottom edge: on the other side of the cursor.
        assert_eq!(loupe_at((1900, 100), size, 24, screen), (1900 - 24 - 114, 124));
        assert_eq!(loupe_at((100, 1070), size, 24, screen), (124, 1070 - 24 - 142));
        assert_eq!(loupe_at((1919, 1079), size, 24, screen), (1919 - 138, 1079 - 166));
        // A screen left of and above the main one.
        let left = Rect { left: -1920, top: -200, right: 0, bottom: 880 };
        assert_eq!(loupe_at((-10, -190), size, 24, left), (-148, -166));
        assert_eq!(loupe_at((-1920, -200), size, 24, left), (-1896, -176));
        // A screen smaller than the magnifier: at its start.
        let tiny = Rect { left: 0, top: 0, right: 100, bottom: 100 };
        assert_eq!(loupe_at((50, 50), size, 24, tiny), (0, 0));
    }

    #[test]
    fn arrow_keys_stay_on_the_desktop() {
        let desktop = Rect { left: -1920, top: 0, right: 1920, bottom: 1080 };
        assert_eq!(nudge((0, 0), (1, 0), desktop), (1, 0));
        assert_eq!(nudge((0, 5), (0, -10), desktop), (0, 0));
        assert_eq!(nudge((-1915, 1075), (-10, 10), desktop), (-1920, 1079));
        assert_eq!(nudge((1919, 0), (10, 0), desktop), (1919, 0));
    }

    #[test]
    fn rects() {
        let r = Rect::at(10, 20, 30, 40);
        assert_eq!((r.width(), r.height()), (30, 40));
        assert_eq!(r.offset(-10, -20), Rect::at(0, 0, 30, 40));
        assert_eq!(r.inflate(2), Rect { left: 8, top: 18, right: 42, bottom: 62 });
        assert!(r.overlaps(Rect::at(39, 59, 5, 5)));
        assert!(!r.overlaps(Rect::at(40, 20, 5, 5)));
        assert!(!r.overlaps(Rect::at(0, 0, 10, 100)));
    }
}
