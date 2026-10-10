/**
 * HEADROOM IDE — Restrained Heading Reveal Animation
 * 
 * Reveals prominent headings within <= 700ms on initial load.
 * Respects `prefers-reduced-motion` and accessibility guidelines.
 */

const animatedHeadings = new WeakSet();

export function revealHeading(element, targetText = null, durationMs = 700) {
    if (!element) return;
    if (animatedHeadings.has(element)) return; // Only animate once per session
    animatedHeadings.add(element);

    const fullText = targetText || element.textContent || '';
    if (!fullText) return;

    // Immediately set aria-label so screen readers receive the complete text without delay
    element.setAttribute('aria-label', fullText);

    // Respect user's motion preferences
    const prefersReducedMotion = typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || fullText.length <= 1) {
        element.textContent = fullText;
        return;
    }

    const totalDuration = Math.min(durationMs, 700);
    const stepInterval = Math.max(12, Math.floor(totalDuration / fullText.length));

    let currentIndex = 0;
    element.textContent = '';

    const timer = setInterval(() => {
        currentIndex++;
        element.textContent = fullText.slice(0, currentIndex);

        if (currentIndex >= fullText.length) {
            clearInterval(timer);
            element.textContent = fullText;
        }
    }, stepInterval);
}
