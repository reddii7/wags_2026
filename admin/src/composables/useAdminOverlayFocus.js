import { nextTick, onBeforeUnmount, onMounted, watch } from "vue";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useAdminOverlayFocus({ isOpen, containerRef, initialFocusRef, onEscape }) {
  let previouslyFocused = null;

  function getFocusableElements() {
    const container = containerRef.value;
    if (!container) return [];
    return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
      (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
    );
  }

  function focusInitialElement() {
    const target = initialFocusRef?.value || getFocusableElements()[0] || containerRef.value;
    target?.focus?.();
  }

  watch(
    isOpen,
    async (open) => {
      if (open) {
        previouslyFocused = document.activeElement;
        await nextTick();
        focusInitialElement();
      } else if (previouslyFocused?.focus) {
        await nextTick();
        previouslyFocused.focus();
        previouslyFocused = null;
      }
    },
  );

  function onKeydown(event) {
    if (!isOpen()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape?.();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = getFocusableElements();
    if (!focusable.length) {
      event.preventDefault();
      containerRef.value?.focus?.();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (!containerRef.value?.contains(active)) {
      event.preventDefault();
      first.focus();
      return;
    }

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  onMounted(() => {
    window.addEventListener("keydown", onKeydown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeydown);
  });
}
