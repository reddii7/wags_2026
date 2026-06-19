import { readonly, ref } from "vue";

const toasts = ref([]);
let nextToastId = 1;

export function useAdminToasts() {
  function removeToast(id) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  function pushToast(message, tone = "success", timeoutMs = 4200) {
    const id = nextToastId;
    nextToastId += 1;
    toasts.value = [...toasts.value, { id, message, tone }];
    if (timeoutMs > 0) {
      window.setTimeout(() => removeToast(id), timeoutMs);
    }
    return id;
  }

  return {
    toasts: readonly(toasts),
    pushToast,
    removeToast,
  };
}
