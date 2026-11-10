/**
 * HP Prime PPL command catalog: names, accepted argument counts, signatures and documentation.
 *
 * Names and argument counts are seeded from hpemu's `crates/ppl-compiler/src/builtins.rs` (MIT, see
 * THIRD_PARTY.md). Signatures and descriptions are written from the HP Prime User Guide. They have not
 * been checked on hardware, so treat details of rarely used optional arguments as approximate.
 *
 * Conventions in signatures: `[x]` is optional, `{…}` is a list literal, `G` is a graphic (`G0`–`G9`),
 * and `_P` commands use pixel coordinates with (0,0) at the top-left of the 320×240 screen.
 */

export type CommandCategory =
  | 'math'
  | 'bits'
  | 'strings'
  | 'lists'
  | 'matrices'
  | 'graphics'
  | 'io'
  | 'time'
  | 'system'
  | 'cas';

export interface Command {
  /** Canonical spelling. PPL commands are upper case; lower case calls the CAS version. */
  name: string;
  category: CommandCategory;
  /** Accepted forms, most common first. Each starts with the command name. */
  signatures: string[];
  /** One-paragraph description (Markdown). */
  doc: string;
  /** Fewest / most arguments accepted. `Infinity` means variadic. */
  minArgs: number;
  maxArgs: number;
  /** Leading arguments that are variables written by the command, e.g. `INPUT(var, …)`. */
  refArgs?: number;
  /** Alternative spellings that resolve to this command. */
  aliases?: string[];
}

export const CATEGORY_LABELS: Record<CommandCategory, string> = {
  math: 'Math',
  bits: 'Integers and bits',
  strings: 'Strings',
  lists: 'Lists',
  matrices: 'Matrices and vectors',
  graphics: 'Graphics',
  io: 'Input and output',
  time: 'Time',
  system: 'System',
  cas: 'CAS',
};

const N = Infinity;

function c(
  category: CommandCategory,
  name: string,
  minArgs: number,
  maxArgs: number,
  signatures: string[],
  doc: string,
  extra: { refArgs?: number; aliases?: string[] } = {},
): Command {
  return { name, category, signatures, doc, minArgs, maxArgs, ...extra };
}

const NONP_NOTE = ' Uses the plot window\'s Cartesian coordinates (`Xmin`…`Ymax`) rather than pixels.';

export const COMMANDS: Command[] = [
  // ---- math ----
  c('math', 'ABS', 1, 1, ['ABS(value)'], 'Absolute value of a number, the modulus of a complex number, or the element-wise absolute value of a list or matrix.'),
  c('math', 'SQRT', 1, 1, ['SQRT(value)'], 'Square root. Negative inputs give a complex result. Also written `√value`.', { aliases: ['√'] }),
  c('math', 'SQ', 1, 1, ['SQ(value)'], 'Square of a value (`value^2`).'),
  c('math', 'EXP', 1, 1, ['EXP(value)'], 'Natural exponential, *e* raised to `value`.'),
  c('math', 'LN', 1, 1, ['LN(value)'], 'Natural (base *e*) logarithm.'),
  c('math', 'LOG', 1, 2, ['LOG(value)', 'LOG(value, base)'], 'Base-10 logarithm, or the logarithm to the given `base`.'),
  c('math', 'ALOG', 1, 1, ['ALOG(value)'], 'Antilogarithm: 10 raised to `value`.'),
  c('math', 'EXPM1', 1, 1, ['EXPM1(value)'], '`e^value − 1`, accurate for values close to 0.'),
  c('math', 'LNP1', 1, 1, ['LNP1(value)'], '`LN(value + 1)`, accurate for values close to 0.'),
  c('math', 'SIN', 1, 1, ['SIN(angle)'], 'Sine. The angle is interpreted in the current angle mode (radians, degrees or gradians).'),
  c('math', 'COS', 1, 1, ['COS(angle)'], 'Cosine, in the current angle mode.'),
  c('math', 'TAN', 1, 1, ['TAN(angle)'], 'Tangent, in the current angle mode.'),
  c('math', 'ASIN', 1, 1, ['ASIN(value)'], 'Inverse sine. The result is an angle in the current angle mode.'),
  c('math', 'ACOS', 1, 1, ['ACOS(value)'], 'Inverse cosine. The result is an angle in the current angle mode.'),
  c('math', 'ATAN', 1, 1, ['ATAN(value)'], 'Inverse tangent. The result is an angle in the current angle mode.'),
  c('math', 'CSC', 1, 1, ['CSC(angle)'], 'Cosecant, `1/SIN(angle)`.'),
  c('math', 'SEC', 1, 1, ['SEC(angle)'], 'Secant, `1/COS(angle)`.'),
  c('math', 'COT', 1, 1, ['COT(angle)'], 'Cotangent, `1/TAN(angle)`.'),
  c('math', 'SINH', 1, 1, ['SINH(value)'], 'Hyperbolic sine.'),
  c('math', 'COSH', 1, 1, ['COSH(value)'], 'Hyperbolic cosine.'),
  c('math', 'TANH', 1, 1, ['TANH(value)'], 'Hyperbolic tangent.'),
  c('math', 'ASINH', 1, 1, ['ASINH(value)'], 'Inverse hyperbolic sine.'),
  c('math', 'ACOSH', 1, 1, ['ACOSH(value)'], 'Inverse hyperbolic cosine.'),
  c('math', 'ATANH', 1, 1, ['ATANH(value)'], 'Inverse hyperbolic tangent.'),
  c('math', 'FLOOR', 1, 1, ['FLOOR(value)'], 'Greatest integer less than or equal to `value`.'),
  c('math', 'CEILING', 1, 1, ['CEILING(value)'], 'Smallest integer greater than or equal to `value`.'),
  c('math', 'ROUND', 1, 2, ['ROUND(value)', 'ROUND(value, places)'], 'Rounds to the given number of decimal places (default 0). A negative `places` rounds to tens, hundreds, and so on. Halves round away from zero.'),
  c('math', 'TRUNCATE', 1, 2, ['TRUNCATE(value)', 'TRUNCATE(value, places)'], 'Cuts `value` off at the given number of decimal places (default 0) without rounding.'),
  c('math', 'IP', 1, 1, ['IP(value)'], 'Integer part: the whole-number part of `value`, discarding the fraction.'),
  c('math', 'FP', 1, 1, ['FP(value)'], 'Fractional part of `value`.'),
  c('math', 'SIGN', 1, 1, ['SIGN(value)'], 'Returns −1, 0 or 1 for a negative, zero or positive real. For a complex number, the unit-modulus value in the same direction.'),
  c('math', 'MAX', 1, N, ['MAX(a, b, …)', 'MAX(list)'], 'Largest of the arguments, or the largest element of a list.'),
  c('math', 'MIN', 1, N, ['MIN(a, b, …)', 'MIN(list)'], 'Smallest of the arguments, or the smallest element of a list.'),
  c('math', 'COMB', 2, 2, ['COMB(n, k)'], 'Number of combinations: ways to choose `k` items from `n`, ignoring order.'),
  c('math', 'PERM', 2, 2, ['PERM(n, k)'], 'Number of permutations: ways to choose `k` items from `n`, in order.'),
  c('math', 'RANDOM', 0, 3, ['RANDOM()', 'RANDOM(n)', 'RANDOM(lower, upper)'], 'Random number. With no arguments, a real in [0, 1). The optional arguments restrict or scale the range. See the User Guide for the multi-value forms.'),
  c('math', 'RANDINT', 0, 3, ['RANDINT(n)', 'RANDINT(lower, upper)', 'RANDINT(lower, upper, count)'], 'Random integer between the given limits (inclusive). With a third argument, returns a list of that many.'),
  c('math', 'RANDNORM', 0, 2, ['RANDNORM(mean, deviation)'], 'Random number from a normal distribution with the given mean and standard deviation.'),
  c('math', 'RANDSEED', 0, 1, ['RANDSEED(seed)'], 'Seeds the random number generator so a sequence can be repeated.'),
  c('math', 'MANT', 1, 1, ['MANT(value)'], 'Mantissa of `value` in scientific notation.'),
  c('math', 'XPON', 1, 1, ['XPON(value)'], 'Exponent of `value` in scientific notation.'),
  c('math', 'RE', 1, 1, ['RE(value)'], 'Real part of a complex number.'),
  c('math', 'IM', 1, 1, ['IM(value)'], 'Imaginary part of a complex number.'),
  c('math', 'CONJ', 1, 1, ['CONJ(value)'], 'Complex conjugate.'),
  c('math', 'ARG', 1, 1, ['ARG(value)'], 'Argument (angle) of a complex number, in the current angle mode.'),
  c('math', 'APPROX', 1, 1, ['APPROX(expression)'], 'Evaluates an expression numerically (approximate mode).'),
  c('math', 'EXACT', 1, 1, ['EXACT(value)'], 'Converts a decimal value to an exact fraction, where possible.'),
  c('math', '→HMS', 1, 1, ['→HMS(value)'], 'Converts decimal hours (or degrees) to hours-minutes-seconds form.'),
  c('math', 'HMS→', 1, 1, ['HMS→(value)'], 'Converts a value in hours-minutes-seconds form to decimal hours (or degrees).'),
  c('math', 'NTHROOT', 2, 2, ['NTHROOT(value, n)'], 'The `n`th root of `value`.'),
  c('math', 'FACTORIAL', 1, 1, ['FACTORIAL(n)'], 'Factorial of `n`, also written `n!`. Non-integers use the gamma function.'),
  c('math', 'MEAN', 1, 2, ['MEAN(list)', 'MEAN(list, frequencies)'], 'Arithmetic mean of a list, optionally weighted by a list of frequencies.'),
  c('math', 'MEDIAN', 1, 2, ['MEDIAN(list)', 'MEDIAN(list, frequencies)'], 'Median of a list, optionally weighted by a list of frequencies.'),
  c('math', 'STDDEV', 1, 2, ['STDDEV(list)', 'STDDEV(list, frequencies)'], 'Standard deviation of a list, optionally weighted by a list of frequencies.'),
  c('math', 'IFTE', 3, 3, ['IFTE(test, ifTrue, ifFalse)'], 'Expression form of IF: evaluates to `ifTrue` when `test` is true and to `ifFalse` otherwise.'),

  // ---- integers / bits ----
  c('bits', 'BITAND', 2, N, ['BITAND(a, b, …)'], 'Bitwise AND of two or more integers.'),
  c('bits', 'BITOR', 2, N, ['BITOR(a, b, …)'], 'Bitwise OR of two or more integers.'),
  c('bits', 'BITXOR', 2, N, ['BITXOR(a, b, …)'], 'Bitwise exclusive OR of two or more integers.'),
  c('bits', 'BITNOT', 1, 1, ['BITNOT(n)'], 'Bitwise complement of an integer, within the current word size.'),
  c('bits', 'BITSL', 1, 2, ['BITSL(n)', 'BITSL(n, bits)'], 'Shifts an integer left by `bits` positions (default 1).'),
  c('bits', 'BITSR', 1, 2, ['BITSR(n)', 'BITSR(n, bits)'], 'Shifts an integer right by `bits` positions (default 1).'),
  c('bits', 'R→B', 1, 1, ['R→B(value)'], 'Converts a real number to a binary integer.', { aliases: ['R->B', 'R_to_B'] }),
  c('bits', 'B→R', 1, 1, ['B→R(value)'], 'Converts a binary integer to a real number.', { aliases: ['B->R', 'B_to_R'] }),
  c('bits', 'SETBASE', 1, 2, ['SETBASE(base)', 'SETBASE(n, base)'], 'Sets the display base for binary integers (2, 8, 10 or 16), or returns `n` in the given base.'),
  c('bits', 'GETBASE', 1, 1, ['GETBASE(n)'], 'Returns the base a binary integer is displayed in.'),
  c('bits', 'SETBITS', 1, 2, ['SETBITS(bits)', 'SETBITS(n, bits)'], 'Sets the word size (in bits) used for binary integers.'),
  c('bits', 'GETBITS', 1, 1, ['GETBITS(n)'], 'Returns the word size (in bits) used for binary integers.'),

  // ---- strings ----
  c('strings', 'ASC', 1, 1, ['ASC(string)'], 'Character codes of a string, as a list of integers.'),
  c('strings', 'CHAR', 1, 1, ['CHAR(code)', 'CHAR(list)'], 'Builds a string from a character code, or from a list of codes.', { aliases: ['CHR'] }),
  c('strings', 'DIM', 1, 1, ['DIM(string)'], 'Number of characters in a string. Also gives the size of a list or the dimensions of a matrix.'),
  c('strings', 'INSTRING', 2, 2, ['INSTRING(string, substring)'], 'Position of the first occurrence of `substring` in `string` (1-based), or 0 if it is absent.'),
  c('strings', 'LEFT', 2, 2, ['LEFT(string, n)'], 'The first `n` characters of a string (or elements of a list).'),
  c('strings', 'RIGHT', 2, 2, ['RIGHT(string, n)'], 'The last `n` characters of a string (or elements of a list).'),
  c('strings', 'MID', 2, 3, ['MID(string, start)', 'MID(string, start, count)'], 'Substring beginning at position `start` (1-based), up to `count` characters, or to the end if `count` is omitted.'),
  c('strings', 'ROTATE', 1, 2, ['ROTATE(string)', 'ROTATE(string, n)'], 'Rotates the characters of a string (or elements of a list) by `n` places; a negative `n` rotates the other way.'),
  c('strings', 'STRING', 1, 5, ['STRING(value)', 'STRING(value, format, digits)'], 'Converts a value to a string, as it would appear on screen.'),
  c('strings', 'UPPER', 1, 1, ['UPPER(string)'], 'Converts a string to upper case.'),
  c('strings', 'LOWER', 1, 1, ['LOWER(string)'], 'Converts a string to lower case.'),
  c('strings', 'REPLACE', 3, 3, ['REPLACE(object, target, replacement)'], 'Replaces occurrences of `target` with `replacement` in a string or list.'),
  c('strings', 'EXPR', 1, 1, ['EXPR(string)'], 'Parses and evaluates the contents of a string as an expression.'),

  // ---- lists ----
  c('lists', 'CONCAT', 2, N, ['CONCAT(a, b, …)'], 'Joins lists end to end (or appends an element to a list).'),
  c('lists', 'MAKELIST', 2, 5, ['MAKELIST(expression, variable, start, end)', 'MAKELIST(expression, variable, start, end, step)'], 'Builds a list by evaluating `expression` for each value of `variable` from `start` to `end`.'),
  c('lists', 'SIZE', 1, 1, ['SIZE(list)'], 'Number of elements in a list.'),
  c('lists', 'SORT', 1, 2, ['SORT(list)', 'SORT(list, function)'], 'Returns a sorted copy of a list (ascending by default). It does not modify the original.'),
  c('lists', 'REVERSE', 1, 1, ['REVERSE(list)'], 'Returns a copy of the list (or string) in reverse order.'),
  c('lists', 'POS', 2, 2, ['POS(list, element)'], 'Position of the first matching element in a list (1-based), or 0 if absent.'),
  c('lists', 'ΣLIST', 1, 1, ['ΣLIST(list)'], 'Sum of the elements of a list.', { aliases: ['SIGMALIST'] }),
  c('lists', '∏LIST', 1, 1, ['∏LIST(list)'], 'Product of the elements of a list.', { aliases: ['PILIST'] }),
  c('lists', 'ΔLIST', 1, 1, ['ΔLIST(list)'], 'List of differences between consecutive elements.', { aliases: ['DELTALIST'] }),
  c('lists', 'EQ', 2, 2, ['EQ(a, b)'], 'Tests two objects for equality (usable with lists and matrices).'),
  c('lists', 'HEAD', 1, 1, ['HEAD(list)'], 'The first element of a list.'),
  c('lists', 'TAIL', 1, 1, ['TAIL(list)'], 'A copy of the list without its first element.'),
  c('lists', 'APPEND', 2, 2, ['APPEND(list, element)'], 'Returns the list with `element` added at the end.'),

  // ---- matrices ----
  c('matrices', 'MAKEMAT', 2, 3, ['MAKEMAT(expression, rows, columns)', 'MAKEMAT(value, rows, columns)'], 'Builds a matrix, evaluating `expression` for each element (using `I` and `J` as row and column indexes).'),
  c('matrices', 'DET', 1, 1, ['DET(matrix)'], 'Determinant of a square matrix.'),
  c('matrices', 'TRN', 1, 1, ['TRN(matrix)'], 'Transpose of a matrix.'),
  c('matrices', 'IDENMAT', 1, 1, ['IDENMAT(n)'], 'The `n`×`n` identity matrix.'),
  c('matrices', 'RANK', 1, 1, ['RANK(matrix)'], 'Rank of a matrix.'),
  c('matrices', 'COLNORM', 1, 1, ['COLNORM(matrix)'], 'Column norm: the largest sum of absolute values down any column.'),
  c('matrices', 'ROWNORM', 1, 1, ['ROWNORM(matrix)'], 'Row norm: the largest sum of absolute values along any row.'),
  c('matrices', 'INVERSE', 1, 1, ['INVERSE(matrix)'], 'Inverse of a square matrix. Equivalent to `matrix^-1`.', { aliases: ['INV'] }),
  c('matrices', 'ADDROW', 3, 3, ['ADDROW(matrix, row, index)'], 'Inserts a row (a list or vector) into a matrix before row `index`.'),
  c('matrices', 'ADDCOL', 3, 3, ['ADDCOL(matrix, column, index)'], 'Inserts a column into a matrix before column `index`.'),
  c('matrices', 'DELROW', 2, 2, ['DELROW(matrix, index)'], 'Removes a row from a matrix.'),
  c('matrices', 'DELCOL', 2, 2, ['DELCOL(matrix, index)'], 'Removes a column from a matrix.'),
  c('matrices', 'REDIM', 2, 2, ['REDIM(object, size)'], 'Changes the dimensions of a list or matrix. `size` is a number for a list or `{rows, columns}` for a matrix.'),
  c('matrices', 'DOT', 2, 2, ['DOT(a, b)'], 'Dot product of two vectors.'),
  c('matrices', 'CROSS', 2, 2, ['CROSS(a, b)'], 'Cross product of two 3-element vectors.'),
  c('matrices', 'EDITMAT', 1, 3, ['EDITMAT(matrix)', 'EDITMAT(matrix, title, readOnly)'], 'Opens the matrix editor and returns the edited matrix.'),

  // ---- graphics ----
  c('graphics', 'RECT_P', 0, 7, ['RECT_P()', 'RECT_P(color)', 'RECT_P([G,] x1, y1, x2, y2, [edgeColor], [fillColor])'], 'Draws a rectangle. With no arguments, clears the screen (`G0`) to white; with one color, fills the whole graphic.'),
  c('graphics', 'RECT', 0, 7, ['RECT()', 'RECT(color)', 'RECT([G,] x1, y1, x2, y2, [edgeColor], [fillColor])'], 'Like `RECT_P`, but with plot-window coordinates.' + NONP_NOTE),
  c('graphics', 'LINE_P', 2, 6, ['LINE_P([G,] x1, y1, x2, y2, [color])'], 'Draws a line between two pixel positions.'),
  c('graphics', 'LINE', 2, 6, ['LINE([G,] x1, y1, x2, y2, [color])'], 'Draws a line between two points.' + NONP_NOTE),
  c('graphics', 'PIXON_P', 2, 4, ['PIXON_P([G,] x, y, [color])'], 'Turns on (colors) the pixel at (`x`, `y`).'),
  c('graphics', 'PIXON', 2, 4, ['PIXON([G,] x, y, [color])'], 'Turns on the pixel at the point (`x`, `y`).' + NONP_NOTE),
  c('graphics', 'PIXOFF_P', 2, 3, ['PIXOFF_P([G,] x, y)'], 'Turns off (clears) the pixel at (`x`, `y`).'),
  c('graphics', 'PIXOFF', 2, 3, ['PIXOFF([G,] x, y)'], 'Turns off the pixel at the point (`x`, `y`).' + NONP_NOTE),
  c('graphics', 'GETPIX_P', 2, 3, ['GETPIX_P([G,] x, y)'], 'Returns the color of the pixel at (`x`, `y`) as an integer (`#RRGGBB`).'),
  c('graphics', 'GETPIX', 2, 3, ['GETPIX([G,] x, y)'], 'Returns the color of the pixel at the point (`x`, `y`).' + NONP_NOTE),
  c('graphics', 'CIRCLE_P', 3, 5, ['CIRCLE_P([G,] x, y, r, [edgeColor], [fillColor])'], 'Draws a circle with center (`x`, `y`) and radius `r` pixels.'),
  c('graphics', 'CIRCLE', 3, 5, ['CIRCLE([G,] x, y, r, [edgeColor], [fillColor])'], 'Draws a circle.' + NONP_NOTE),
  c('graphics', 'FILLCIRCLE_P', 3, 5, ['FILLCIRCLE_P([G,] x, y, r, [edgeColor], [fillColor])'], 'Draws a filled circle with center (`x`, `y`) and radius `r` pixels.'),
  c('graphics', 'ARC_P', 3, 7, ['ARC_P([G,] x, y, r, [startAngle, endAngle], [color])'], 'Draws an arc of a circle. Angles are in the current angle mode, measured from the positive x axis.'),
  c('graphics', 'ARC', 3, 7, ['ARC([G,] x, y, r, [startAngle, endAngle], [color])'], 'Draws an arc of a circle.' + NONP_NOTE),
  c('graphics', 'TEXTOUT_P', 3, 8, ['TEXTOUT_P(text, [G,] x, y, [font], [textColor], [width], [backColor])'], 'Draws text at pixel position (`x`, `y`). `font` is 1–7 (7 is the largest). If `width` is given, text is clipped to that width.'),
  c('graphics', 'TEXTOUT', 3, 8, ['TEXTOUT(text, [G,] x, y, [font], [textColor], [width], [backColor])'], 'Draws text at a point.' + NONP_NOTE),
  c('graphics', 'BLIT_P', 1, 11, ['BLIT_P(dstG, [dx1, dy1, dx2, dy2], srcG, [sx1, sy1, sx2, sy2], [maskColor])'], 'Copies a rectangle of pixels from graphic `srcG` onto `dstG`. Pixels equal to `maskColor` are skipped.'),
  c('graphics', 'BLIT', 1, 11, ['BLIT(dstG, [dx1, dy1, dx2, dy2], srcG, [sx1, sy1, sx2, sy2], [maskColor])'], 'Copies a rectangle of one graphic onto another.' + NONP_NOTE),
  c('graphics', 'DIMGROB_P', 2, 4, ['DIMGROB_P(G, width, height, [color])', 'DIMGROB_P(G, list)'], 'Sets the size of a graphic variable, filling it with `color`, or builds it from a list of pixel data.'),
  c('graphics', 'DIMGROB', 2, 4, ['DIMGROB(G, width, height, [color])', 'DIMGROB(G, list)'], 'Sets the size of a graphic variable.' + NONP_NOTE),
  c('graphics', 'SUBGROB_P', 2, 6, ['SUBGROB_P(srcG, dstG)', 'SUBGROB_P(srcG, x1, y1, x2, y2, dstG)'], 'Copies a region of `srcG` (or all of it) into the graphic `dstG`.'),
  c('graphics', 'SUBGROB', 2, 6, ['SUBGROB(srcG, dstG)', 'SUBGROB(srcG, x1, y1, x2, y2, dstG)'], 'Copies a region of one graphic into another.' + NONP_NOTE),
  c('graphics', 'INVERT_P', 0, 5, ['INVERT_P([G,] [x1, y1, x2, y2])'], 'Inverts the colors in a rectangle of the graphic (the whole graphic if no coordinates are given).'),
  c('graphics', 'FILLPOLY_P', 2, 4, ['FILLPOLY_P([G,] {points}, color, [alpha])'], 'Draws a filled polygon through a list of `(x, y)` pixel positions.'),
  c('graphics', 'TRIANGLE_P', 0, 15, ['TRIANGLE_P([G,] x1, y1, x2, y2, x3, y3, color, [alpha])'], 'Draws a filled triangle. Per-vertex colors can be given for gradient shading.'),
  c('graphics', 'GROBW_P', 1, 1, ['GROBW_P(G)'], 'Width of a graphic, in pixels.'),
  c('graphics', 'GROBH_P', 1, 1, ['GROBH_P(G)'], 'Height of a graphic, in pixels.'),
  c('graphics', 'RGB', 3, 4, ['RGB(red, green, blue)', 'RGB(red, green, blue, alpha)'], 'Builds a color integer from components in the range 0–255, for use as a color argument in the drawing commands.'),

  // ---- input / output ----
  c('io', 'PRINT', 0, 1, ['PRINT()', 'PRINT(value)'], 'Writes a line to the terminal (the Prime\'s program output screen). `PRINT()` with no argument clears the terminal.'),
  c('io', 'MSGBOX', 1, 2, ['MSGBOX(message)', 'MSGBOX(message, mode)'], 'Shows a message box and waits for the user. With `mode` 1 it offers OK/Cancel and returns the choice.'),
  c('io', 'INPUT', 1, 6, ['INPUT(var)', 'INPUT(var, title, label, help, reset, initial)', 'INPUT({vars}, title, {labels}, {help}, reset, {initial})'], 'Shows an input form and stores the entries in the named variable(s). Returns 1 for OK and 0 for Cancel.', { refArgs: 1 }),
  c('io', 'CHOOSE', 2, N, ['CHOOSE(var, title, item1, item2, …)', 'CHOOSE(var, title, {items})'], 'Shows a menu and stores the number of the chosen item in `var`. If the user cancels, `var` is left unchanged.', { refArgs: 1 }),
  c('io', 'GETKEY', 0, 0, ['GETKEY'], 'Returns the code of the key pressed (0–50, the keypad matrix), or −1 if no key was pressed.'),
  c('io', 'ISKEYDOWN', 1, 1, ['ISKEYDOWN(key)'], 'Returns true while the key with the given code is held down.'),
  c('io', 'WAIT', 0, 1, ['WAIT()', 'WAIT(seconds)'], 'Pauses the program for `seconds`. With no argument, or 0, waits for a key press and returns its code.'),
  c('io', 'MOUSE', 0, 1, ['MOUSE()', 'MOUSE(n)'], 'Returns the touch-screen position as `{x, y, …}` (an empty list if there is no touch).'),
  c('io', 'DISP', 2, 2, ['DISP(row, text)'], 'Displays text on a numbered line of the screen.'),
  c('io', 'FREEZE', 0, 0, ['FREEZE'], 'Halts the program and holds the current screen until a key is pressed.'),
  c('io', 'DRAWMENU', 0, 6, ['DRAWMENU(label1, label2, …)'], 'Draws a soft-key menu along the bottom of the screen.'),
  c('io', 'EDITLIST', 1, 1, ['EDITLIST(list)'], 'Opens the list editor for the named list variable.'),

  // ---- time ----
  c('time', 'TICKS', 0, 0, ['TICKS'], 'Milliseconds since the calculator started. Use differences to time code.'),
  c('time', 'TIME', 0, 0, ['TIME'], 'Current time as a list or number, depending on the form used.'),
  c('time', 'DATE', 0, 0, ['DATE'], 'Current date.'),

  // ---- system ----
  c('system', 'TYPE', 1, 1, ['TYPE(object)'], 'Type code of an object: 0 real, 1 integer, 2 string, 3 complex, 4 matrix, 6 list. Other codes exist for less common objects; see the User Guide.'),
  c('system', 'EVAL', 1, 1, ['EVAL(expression)'], 'Evaluates an expression, substituting variable values.'),
  c('system', 'STARTAPP', 1, 1, ['STARTAPP("name")'], 'Starts an application by name.'),
  c('system', 'STARTVIEW', 1, 2, ['STARTVIEW(view)', 'STARTVIEW(view, redraw)'], 'Opens a view (such as Plot or Numeric) of the current application.'),
  c('system', 'RECALL', 1, 1, ['RECALL(name)'], 'Returns the contents of the named variable.'),
  c('system', 'NOTES', 0, 1, ['NOTES()', 'NOTES("name")'], 'Opens the Notes application, optionally on the named note.'),
  c('system', 'PROGRAMS', 0, 1, ['PROGRAMS()', 'PROGRAMS("name")'], 'Opens the Program Catalog, optionally on the named program.'),
  c('system', 'AFILES', 0, 1, ['AFILES()'], 'Lists or opens application files.'),
  c('system', 'HVARS', 0, 1, ['HVARS()'], 'Returns the variables of the Home view.'),

  // ---- CAS ----
  c('cas', 'CAS', 0, N, ['CAS(command)'], 'Runs a command in the CAS (computer algebra system). Lower-case command names call the CAS version.'),
];

// ---- lookups ----

const BY_NAME = new Map<string, Command>();
for (const cmd of COMMANDS) {
  BY_NAME.set(cmd.name, cmd);
  for (const alias of cmd.aliases ?? []) BY_NAME.set(alias, cmd);
}

/** Exact (case-sensitive) lookup by canonical name or alias. */
export function lookupCommand(name: string): Command | undefined {
  return BY_NAME.get(name);
}

/** Lookup that ignores letter case. On the calculator a lower-case name calls the CAS version. */
export function lookupCommandAnyCase(name: string): Command | undefined {
  return BY_NAME.get(name) ?? BY_NAME.get(name.toUpperCase());
}

/** True if `n` arguments are accepted by the command. */
export function acceptsArgCount(cmd: Command, n: number): boolean {
  return n >= cmd.minArgs && n <= cmd.maxArgs;
}

/** Human-readable arity, e.g. `1`, `1-2`, `2 or more`. */
export function arityText(cmd: Command): string {
  if (cmd.minArgs === cmd.maxArgs) return String(cmd.minArgs);
  if (cmd.maxArgs === Infinity) return `${cmd.minArgs} or more`;
  return `${cmd.minArgs}-${cmd.maxArgs}`;
}

/** Hover text (Markdown) for a command. */
export function commandMarkdown(cmd: Command): string {
  const sigs = cmd.signatures.map((s) => '`' + s + '`').join('  \n');
  return `${sigs}\n\n${cmd.doc}\n\n*${CATEGORY_LABELS[cmd.category]}*`;
}
