export async function writeClipboardText(text, clipboard = globalThis.navigator?.clipboard) {
  if (typeof text !== 'string') {
    throw new TypeError('Clipboard text must be a string');
  }

  if (!clipboard || typeof clipboard.writeText !== 'function') {
    throw new Error('Clipboard access is unavailable');
  }

  await clipboard.writeText(text);
}

export function setPostCopyAvailability(button, content) {
  const postContent = typeof content === 'string' ? content : '';
  button.disabled = postContent.length === 0;
  return postContent;
}
