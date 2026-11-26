/**
 * Copying text from inside Reddit's web view. The Clipboard API is the
 * normal way, but the web view can refuse it (it runs in a sandboxed
 * iframe, where `clipboard-write` may not be allowed), so a refusal falls
 * back to the old way: select the text in a hidden textarea and run the
 * copy command. Only if both fail does the caller show the text to copy
 * by hand.
 */

export type ClipboardEnv = {
  /** navigator.clipboard.writeText. */
  writeText(text: string): Promise<void>;
  /** Select the text in a hidden textarea and copy it; true if it worked. */
  execCopy(text: string): boolean;
};

/** True if the text reached the clipboard by either way. */
export async function copyText(
  text: string,
  env: ClipboardEnv = browserClipboard()
): Promise<boolean> {
  try {
    await env.writeText(text);
    return true;
  } catch {
    // Refused (no permission, the document isn't focused, or no Clipboard
    // API at all): try the fallback below.
  }
  try {
    return env.execCopy(text);
  } catch {
    return false;
  }
}

/** The real browser's clipboard, read when a copy starts. */
function browserClipboard(): ClipboardEnv {
  return {
    // navigator.clipboard is missing outside secure contexts, though the
    // DOM types say it is always there. Reading it inside the call turns
    // that into a rejection, which copyText catches like any other.
    writeText: async (text) => {
      await navigator.clipboard.writeText(text);
    },
    execCopy: copyWithTextarea,
  };
}

function copyWithTextarea(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.readOnly = true;
  // Off screen rather than display:none, which can't be selected, and
  // fixed so adding it doesn't scroll the page.
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  try {
    // execCommand is deprecated, but it is the only copy that works where
    // the Clipboard API is blocked, which is why this fallback exists.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return document.execCommand('copy');
  } finally {
    area.remove();
  }
}
