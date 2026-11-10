/**
 * The Monaco editor contributions this IDE uses. Replaces `monaco-editor/features/register.all`,
 * which also pulls in the diff editor, inline completions, GPU rendering, color picker, codelens,
 * inlay hints, sticky scroll, drag-and-drop and more (about 1 MB of minified JS we never use).
 *
 * Add a contribution here when a feature needs it, e.g. `monaco-editor/features/rename/register`
 * once a rename provider exists.
 */
import 'monaco-editor/features/codicon/register';
import 'monaco-editor/features/codeEditor/register';

// Language features backed by src/lib/lang/providers.ts and diagnostics.ts.
// The suggest widget itself: `features/suggest` only registers "suggestions as inline completions",
// and register.all gets the widget indirectly through inline completions.
import 'monaco-editor/editor/contrib/suggest/browser/suggestController';
import 'monaco-editor/features/snippet/register';
import 'monaco-editor/features/hover/register';
import 'monaco-editor/features/parameterHints/register';
import 'monaco-editor/features/gotoSymbol/register';
import 'monaco-editor/features/referenceSearch/register';
import 'monaco-editor/features/documentSymbols/register';
import 'monaco-editor/features/quickOutline/register';
import 'monaco-editor/features/folding/register';
import 'monaco-editor/features/format/register';
import 'monaco-editor/features/gotoError/register';

// Everyday editing.
import 'monaco-editor/features/bracketMatching/register';
import 'monaco-editor/features/caretOperations/register';
import 'monaco-editor/features/clipboard/register';
import 'monaco-editor/features/comment/register';
import 'monaco-editor/features/contextmenu/register';
import 'monaco-editor/features/cursorUndo/register';
import 'monaco-editor/features/find/register';
import 'monaco-editor/features/fontZoom/register';
import 'monaco-editor/features/gotoLine/register';
import 'monaco-editor/features/indentation/register';
import 'monaco-editor/features/lineSelection/register';
import 'monaco-editor/features/linesOperations/register';
import 'monaco-editor/features/multicursor/register';
import 'monaco-editor/features/quickCommand/register';
import 'monaco-editor/features/quickHelp/register';
import 'monaco-editor/features/readOnlyMessage/register';
import 'monaco-editor/features/smartSelect/register';
import 'monaco-editor/features/tokenization/register';
import 'monaco-editor/features/wordHighlighter/register';
import 'monaco-editor/features/wordOperations/register';
import 'monaco-editor/features/wordPartOperations/register';
