export const triggerHapticFeedback = (duration = 10) => {
    if (typeof window === "undefined") return;
    if (typeof window.navigator?.vibrate !== "function") return;
    window.navigator.vibrate(duration);
};