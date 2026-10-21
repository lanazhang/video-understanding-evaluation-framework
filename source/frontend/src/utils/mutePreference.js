// Remembers whether the user wants video muted, in a cookie (kept for a year). Muted until they change it.
// A cookie is shared by every localhost port, so the name is specific to this app.
const COOKIE_NAME = 'vue_video_muted'
const ONE_YEAR_S = 60 * 60 * 24 * 365

export function getMutedPreference() {
  try {
    const entry = document.cookie.split('; ').find(c => c.startsWith(`${COOKIE_NAME}=`))
    return entry ? entry.slice(COOKIE_NAME.length + 1) !== '0' : true
  } catch {
    return true
  }
}

export function saveMutedPreference(muted) {
  try {
    document.cookie = `${COOKIE_NAME}=${muted ? 1 : 0}; max-age=${ONE_YEAR_S}; path=/; SameSite=Lax`
  } catch {
    // cookies unavailable: the preference just won't persist
  }
}

// Set a <video>'s muted state from the saved preference
export function applyMutedPreference(videoElement) {
  if (videoElement) videoElement.muted = getMutedPreference()
}

// onVolumeChange handler: saves only when the muted state really changed (volume-slider moves and our own
// applyMutedPreference calls leave it equal, so they don't write)
export function persistMutedChange(event) {
  const muted = event.currentTarget.muted
  if (muted !== getMutedPreference()) saveMutedPreference(muted)
}

// Callback ref for a <video>: keeps `ref.current` up to date and applies the saved preference on mount
export function bindMutedPreference(ref) {
  return (videoElement) => {
    ref.current = videoElement
    applyMutedPreference(videoElement)
  }
}
