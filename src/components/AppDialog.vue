<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { triggerHapticFeedback } from "../utils/haptics";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  ariaLabel: {
    type: String,
    default: "Dialog",
  },
});

const emit = defineEmits(["update:modelValue", "close"]);
const dialogRef = ref(null);

const closeDialog = () => {
  emit("update:modelValue", false);
  emit("close");
};

const requestCloseDialog = () => {
  triggerHapticFeedback();
  closeDialog();
};

watch(
  [() => props.modelValue, dialogRef],
  async ([isOpen, dialog]) => {
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      await nextTick();
      if (!dialog.open) {
        dialog.showModal();
      }
      return;
    }

    if (!isOpen && dialog.open) {
      dialog.close();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (dialogRef.value?.open) {
    dialogRef.value.close();
  }
});
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialogRef"
      class="app-dialog"
      :aria-label="ariaLabel"
      @close="closeDialog"
      @cancel.prevent="requestCloseDialog"
      @click="
        ($event) =>
          $event.target === $event.currentTarget && requestCloseDialog()
      "
    >
      <section class="app-dialog__panel content-panel content-panel--minimal">
        <div class="app-dialog__header">
          <slot name="header" />
          <button
            type="button"
            class="app-dialog__close utility-link"
            @click="requestCloseDialog"
          >
            Close
          </button>
        </div>
        <slot />
      </section>
    </dialog>
  </Teleport>
</template>
