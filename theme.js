// Runs before first paint (blocking, in <head>) so a saved light/dark theme doesn't flash.
try { const t = JSON.parse(localStorage.getItem('eng:v1'))?.settings?.theme; if (t && t !== 'system') document.documentElement.dataset.theme = t; } catch {}
