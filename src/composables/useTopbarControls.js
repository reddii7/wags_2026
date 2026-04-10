import { computed, shallowRef } from "vue";

const seasonControl = shallowRef(null);

export const useTopbarControls = () => {
    const setSeasonControl = (control) => {
        seasonControl.value = control;
    };

    const clearSeasonControl = (control) => {
        if (!control || seasonControl.value === control) {
            seasonControl.value = null;
        }
    };

    return {
        seasonControl: computed(() => seasonControl.value),
        setSeasonControl,
        clearSeasonControl,
    };
};