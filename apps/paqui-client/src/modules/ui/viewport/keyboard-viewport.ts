// The on-screen keyboard of iOS covers the page instead of resizing it (Android resizes it, see interactive-widget
// in index.html): the browser then scrolls the whole page up to show the focused field, and a full-height screen
// like the chat loses its header above the top. The visible height is kept in --app-height instead, so those screens
// shrink to what stays visible above the keyboard and nothing scrolls away. data-keyboard-open hides the tab bar.

// Below this, a change of the visible height is the browser bars moving, not a keyboard
const KEYBOARD_MIN_HEIGHT_PX = 120;

export function trackKeyboardViewport() {
  const viewport = window.visualViewport;

  if (!viewport) {
    return;
  }

  const root = document.documentElement;
  // The full height at the current width: Android with interactive-widget shrinks the page too, so the
  // keyboard is told from the tallest height seen, reset when the phone is rotated
  let fullHeight = { width: window.innerWidth, height: window.innerHeight };

  const update = () => {
    if (fullHeight.width !== window.innerWidth) {
      fullHeight = { width: window.innerWidth, height: window.innerHeight };
    }
    fullHeight.height = Math.max(fullHeight.height, window.innerHeight, viewport.height);

    const keyboardHeight = fullHeight.height - viewport.height;
    const isKeyboardOpen = keyboardHeight > KEYBOARD_MIN_HEIGHT_PX;

    root.toggleAttribute('data-keyboard-open', isKeyboardOpen);

    if (!isKeyboardOpen) {
      root.style.removeProperty('--app-height');
      return;
    }

    root.style.setProperty('--app-height', `${viewport.height}px`);
    // The page is now as tall as what is visible: undo the scroll the browser made to reveal the field
    if (window.scrollY !== 0) {
      window.scrollTo(0, 0);
    }
  };

  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  update();
}
