/** Normalize a control against its scrolling content, without hiding size/layout changes.
 * Viewport position is still checked separately after deliberate scroll preparation. */
export function scrollContentRect({ control, pane, scrollLeft, scrollTop }) {
  return {
    x: control.x - pane.x + scrollLeft,
    y: control.y - pane.y + scrollTop,
    width: control.width,
    height: control.height,
  };
}

export async function readScrollableControlGeometry(control) {
  const measured = await control.evaluate(node => {
    const pane = node.closest('.ml-dialog-scroll');
    if (!pane) throw new Error('Expected the control inside the Merge dialog scroll pane');
    const rect = element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    return { control: rect(node), pane: rect(pane), scrollLeft: pane.scrollLeft, scrollTop: pane.scrollTop };
  });
  return { ...measured, content: scrollContentRect(measured) };
}
