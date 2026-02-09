/**
 * Convert TipTap JSON content (stored as string in Dexie) to plain text.
 * Recursively extracts text from all TipTap node types.
 */
export function tiptapJsonToPlainText(notesField: string): string {
  if (!notesField) return '';

  let doc: any;
  try {
    doc = JSON.parse(notesField);
  } catch {
    // If it's not JSON, it's already plain text
    return notesField;
  }

  if (!doc || !doc.content) return '';

  return extractText(doc.content).trim();
}

function extractText(nodes: any[]): string {
  const parts: string[] = [];

  for (const node of nodes) {
    if (node.type === 'text') {
      parts.push(node.text || '');
    } else if (node.content) {
      parts.push(extractText(node.content));
      // Add newline after block-level nodes
      if (['paragraph', 'heading', 'listItem', 'taskItem', 'codeBlock', 'blockquote'].includes(node.type)) {
        parts.push('\n');
      }
    }
  }

  return parts.join('');
}
