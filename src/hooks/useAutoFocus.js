import { useEffect, useRef } from 'react';

/**
 * Custom hook to auto-focus an input element and force DOM reflow
 * Fixes input field responsiveness issues in Electron/React apps
 * 
 * @param {Array} deps - Dependencies array to trigger refocus
 * @returns {React.RefObject} - Ref to attach to the input element
 * 
 * @example
 * const inputRef = useAutoFocus([isDialogOpen]);
 * <input ref={inputRef} ... />
 */
export function useAutoFocus(deps = []) {
    const ref = useRef(null);

    useEffect(() => {
        if (ref.current) {
            // Force reflow to ensure DOM is ready
            // This fixes the "input not responding until window resize" bug
            ref.current.offsetHeight;

            // Small delay to ensure React has finished rendering
            const timeoutId = setTimeout(() => {
                if (ref.current) {
                    ref.current.focus();
                }
            }, 50);

            return () => clearTimeout(timeoutId);
        }
    }, deps);

    return ref;
}
