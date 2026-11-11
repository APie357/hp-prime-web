/**
 * Python modules available on the HP Prime (MicroPython).
 *
 * Module and member NAMES come from the calculator's own Python CMDS menu (firmware 2.1.14730, as
 * reproduced at udel.edu/~mm/hp/primePython/upython.html) and HP's "HP Prime Python activities"
 * guide, which agree.
 *
 * SIGNATURES: the standard MicroPython modules follow the MicroPython docs. HP doesn't document the
 * `hpprime`, `graphic`, `cas`, `arith`, `linalg` and `matplotl` signatures; where one is given here it
 * comes from community examples or the matching PPL/CAS command and is marked `unverified`.
 */

export type MemberKind = 'function' | 'constant' | 'class';

export interface PyMember {
  name: string;
  kind: MemberKind;
  /** Parameter list without the name, e.g. `(x, y)`. */
  sig?: string;
  doc?: string;
  /** The signature isn't documented by HP; it's from examples or the matching PPL command. */
  unverified?: boolean;
}

export interface PyModule {
  name: string;
  doc: string;
  members: PyMember[];
}

const f = (name: string, sig?: string, doc?: string): PyMember => ({ name, kind: 'function', sig, doc });
/** HP-specific function whose signature is inferred, not documented. */
const u = (name: string, sig?: string, doc?: string): PyMember => ({ name, kind: 'function', sig, doc, unverified: true });
const c = (name: string, doc?: string): PyMember => ({ name, kind: 'constant', doc });
const k = (name: string, sig?: string, doc?: string): PyMember => ({ name, kind: 'class', sig, doc });
/** Names only (no signature known). */
const names = (list: string): PyMember[] => list.split(/\s+/).filter(Boolean).map((n) => ({ name: n, kind: 'function' }));

const G = 'G is the graphics buffer: 0 = the screen, 1–9 = off-screen buffers (G1–G9).';
const CART = 'The `_c` variant takes Cartesian (plot) coordinates instead of pixels.';
const COLOR = 'Colors are 0xRRGGBB integers.';

/** `name` + `name_c` pair for hpprime drawing calls. */
function pc(name: string, sig: string, doc: string): PyMember[] {
  return [u(name, sig, `${doc} ${G} ${COLOR}`), u(`${name}_c`, sig, `${doc} ${CART}`)];
}

export const PY_MODULES: PyModule[] = [
  {
    name: 'hpprime',
    doc: 'The HP Prime system: fast drawing into G0–G9, keyboard and touch input, and `eval` to run any PPL command.',
    members: [
      u('eval', '(cmd)', 'Evaluate a PPL expression or command (a string) and return the result, e.g. `eval("getkey")`, `eval("ticks")`, `eval(\'msgbox("Hi")\')`.'),
      ...pc('pixon', '(G, x, y, color)', 'Set one pixel.'),
      ...pc('line', '(G, x1, y1, x2, y2, color)', 'Draw a line.'),
      ...pc('rect', '(G, x, y, w, h, color)', 'Draw a rectangle outline.'),
      ...pc('fillrect', '(G, x, y, w, h, edge_color, fill_color)', 'Draw a filled rectangle.'),
      ...pc('circle', '(G, x, y, r, color)', 'Draw a circle.'),
      ...pc('arc', '(G, x, y, r, color, a1, a2)', 'Draw an arc.'),
      ...pc('textout', '(G, x, y, text, color)', 'Draw text.'),
      ...pc('blit', '(G_dest, x, y, G_src)', 'Copy graphics buffer G_src into G_dest at (x, y).'),
      ...pc('strblit', '(G_dest, x, y, w, h, G_src, sx, sy, sw, sh)', 'Copy (and stretch) part of G_src into a w×h area of G_dest.'),
      ...pc('dimgrob', '(G, w, h, color)', 'Resize graphics buffer G (1–9) to w×h pixels, filled with color.'),
      ...pc('grob', '(G, …)', 'Create or replace a graphics buffer.'),
      ...pc('grobw', '(G)', 'Width of graphics buffer G.'),
      ...pc('grobh', '(G)', 'Height of graphics buffer G.'),
      u('keyboard', '()', 'Keys held down right now, as a bit mask (bit n = key code n; same codes as GETKEY).'),
      u('mouse', '()', 'Touch state: one list per finger `[x, y, x_orig, y_orig, type]` (empty when not touching).'),
      u('get_cartesian', '()', 'The Cartesian window used by the `_c` drawing calls.'),
      u('set_cartesian', '(…)', 'Set the Cartesian window used by the `_c` drawing calls.'),
    ],
  },
  {
    name: 'graphic',
    doc: 'Pixel and color drawing, compatible with KhiCAS/Xcas `graphic` (TI-Nspire, NumWorks). Some calls do nothing on the Prime and exist for portability.',
    members: [
      ...['black', 'white', 'red', 'green', 'blue', 'cyan', 'magenta', 'yellow'].map((n) => c(n, `Color constant: ${n}.`)),
      u('clear_screen', '(color=white)', 'Clear the screen.'),
      u('show_screen', '()', 'Show the drawing (for portability; drawing is immediate on the Prime).'),
      u('show', '()', 'Same as show_screen.'),
      u('set_pixel', '(x, y, color)', 'Set one pixel.'),
      u('draw_pixel', '(x, y, color)', 'Set one pixel.'),
      u('get_pixel', '(x, y)', 'Color of a pixel.'),
      u('draw_line', '(x1, y1, x2, y2, color)', 'Draw a line.'),
      u('draw_rectangle', '(x, y, w, h, color)', 'Draw a rectangle outline.'),
      u('draw_circle', '(x, y, r, color)', 'Draw a circle.'),
      u('draw_filled_circle', '(x, y, r, color)', 'Draw a filled circle.'),
      u('draw_arc', '(x, y, rx, ry, a1, a2, color)', 'Draw an elliptic arc (angles in radians).'),
      u('draw_filled_arc', '(x, y, rx, ry, a1, a2, color)', 'Draw a filled elliptic sector.'),
      u('draw_polygon', '(points, color)', 'Draw a polygon through a list of [x, y] points.'),
      u('draw_filled_polygon', '(points, color)', 'Draw a filled polygon.'),
      u('draw_string', '(text, x, y, color=black, bg=white)', 'Draw text.'),
    ],
  },
  {
    name: 'cas',
    doc: 'Evaluate CAS (Xcas/Giac) expressions from Python.',
    members: [
      u('caseval', '(expr)', 'Evaluate a CAS expression given as a string and return the result, e.g. `caseval("factor(x^2-1)")`.'),
      u('xcas', '(expr)', 'Evaluate a CAS expression (string) with Xcas.'),
      u('eval_expr', '(expr)', 'Evaluate an expression string.'),
      u('get_key', '()', 'Read a key.'),
    ],
  },
  {
    name: 'arith',
    doc: 'Arithmetic and prime-number functions (CAS).',
    members: [
      u('gcd', '(a, b)', 'Greatest common divisor.'),
      u('lcm', '(a, b)', 'Least common multiple.'),
      u('iegcd', '(a, b)', 'Extended GCD: [u, v, d] with u·a + v·b = d.'),
      u('ifactor', '(n)', 'Prime factorization of an integer.'),
      u('isprime', '(n)', 'Whether n is prime.'),
      u('nextprime', '(n)', 'Smallest prime greater than n.'),
      u('prevprime', '(n)', 'Largest prime less than n.'),
      u('nprimes', '(n)', 'Number of primes up to n.'),
      u('euler', '(n)', 'Euler’s totient φ(n).'),
      u('asc', '(s)', 'Character codes of a string.'),
      u('char', '(codes)', 'String from character codes.'),
    ],
  },
  {
    name: 'linalg',
    doc: 'Linear algebra (CAS-backed): matrices are lists of lists.',
    members: [
      ...names('abs add apply arange conj cross det dot egv eig eigenvects eye fft horner identity idn ifft im imag inv linspace matrix mul ones pcoeff peval proot rand ranm ranv re real rref shape size solve sub transpose zeros'),
      c('pi', 'π'),
    ].map((m) => ({ ...m, unverified: m.kind === 'function' })),
  },
  {
    name: 'matplotl',
    doc: 'Chart plotting, a small subset of matplotlib.pyplot.',
    members: names('arrow axis bar barplot boxplot boxwhisker clf grid hist histogram linear_regression_plot plot scatter scatterplot show text vector').map(
      (m) => ({ ...m, unverified: true }),
    ),
  },
  {
    name: 'math',
    doc: 'Mathematical functions (MicroPython math).',
    members: [
      c('e', 'Euler’s number.'),
      c('pi', 'π'),
      ...'acos acosh asin asinh atan atanh ceil cos cosh degrees erf erfc exp expm1 fabs floor gamma isfinite isinf isnan lgamma log10 log2 radians sin sinh sqrt tan tanh trunc'
        .split(' ')
        .map((n) => f(n, '(x)')),
      f('atan2', '(y, x)'),
      f('copysign', '(x, y)'),
      f('fmod', '(x, y)'),
      f('frexp', '(x)', 'Mantissa and exponent: (m, e).'),
      f('ldexp', '(x, exp)'),
      f('log', '(x, base=e)'),
      f('modf', '(x)', 'Fractional and integer parts.'),
      f('pow', '(x, y)'),
    ],
  },
  {
    name: 'cmath',
    doc: 'Complex-number math (MicroPython cmath).',
    members: [
      c('e'),
      c('pi'),
      ...'cos exp log log10 sin sqrt phase polar'.split(' ').map((n) => f(n, '(z)')),
      f('rect', '(r, phi)', 'Complex number from modulus and argument.'),
    ],
  },
  {
    name: 'urandom',
    doc: 'Random numbers (there is no `random` module; use `urandom`).',
    members: [
      f('random', '()', 'Float in [0, 1).'),
      f('uniform', '(a, b)', 'Float between a and b.'),
      f('randint', '(a, b)', 'Integer a ≤ n ≤ b.'),
      f('randrange', '(start, stop=None, step=1)'),
      f('choice', '(seq)', 'Random element of a sequence.'),
      f('getrandbits', '(n)', 'Integer with n random bits.'),
      f('seed', '(n)', 'Seed the generator.'),
    ],
  },
  {
    name: 'micropython',
    doc: 'MicroPython internals.',
    members: [
      f('const', '(expr)', 'Declare a compile-time constant.'),
      f('opt_level', '(level=None)'),
      f('mem_info', '(verbose=None)'),
      f('qstr_info', '(verbose=None)'),
      f('stack_use', '()'),
      f('pystack_use', '()'),
      f('heap_lock', '()'),
      f('heap_unlock', '()'),
      f('kbd_intr', '(chr)'),
    ],
  },
  {
    name: 'gc',
    doc: 'Garbage collector.',
    members: [
      f('collect', '()'),
      f('enable', '()'),
      f('disable', '()'),
      f('isenabled', '()'),
      f('mem_alloc', '()', 'Bytes of heap in use.'),
      f('mem_free', '()', 'Bytes of heap free.'),
      f('threshold', '(amount=None)'),
    ],
  },
  {
    name: 'sys',
    doc: 'System-specific parameters.',
    members: [
      ...'argv byteorder implementation maxsize modules path platform stderr stdin stdout version version_info'
        .split(' ')
        .map((n) => c(n)),
      f('exit', '(retval=0)'),
      f('exc_info', '()'),
      f('print_exception', '(exc, file=sys.stdout)'),
    ],
  },
  {
    name: 'array',
    doc: 'Arrays of numeric data.',
    members: [k('array', '(typecode, iterable=None)', 'Array of numbers; methods append, extend.')],
  },
  {
    name: 'uio',
    doc: 'Streams and files. Files live in the app (or program) the code belongs to.',
    members: [
      f('open', "(name, mode='r')", 'Open a file.'),
      k('FileIO', "(name, mode='r')", 'Binary file.'),
      k('TextIOWrapper', '(…)', 'Text file.'),
      k('StringIO', "(string='')", 'In-memory text stream.'),
      k('BytesIO', "(bytes=b'')", 'In-memory binary stream.'),
    ],
  },
  {
    name: 'ucollections',
    doc: 'Container types.',
    members: [
      k('namedtuple', '(name, fields)'),
      k('OrderedDict', '(…)'),
      k('deque', '(iterable, maxlen)', 'Methods append, popleft.'),
    ],
  },
  {
    name: 'ustruct',
    doc: 'Pack and unpack binary data.',
    members: [
      f('calcsize', '(fmt)'),
      f('pack', '(fmt, v1, v2, …)'),
      f('pack_into', '(fmt, buffer, offset, v1, v2, …)'),
      f('unpack', '(fmt, data)'),
      f('unpack_from', '(fmt, data, offset=0)'),
    ],
  },
  {
    name: 'ure',
    doc: 'Regular expressions (a simple subset).',
    members: [f('compile', '(regex)'), f('match', '(regex, string)'), f('search', '(regex, string)'), c('DEBUG')],
  },
  {
    name: 'uhashlib',
    doc: 'Hashing.',
    members: [k('sha256', '(data=None)', 'Methods update, digest.')],
  },
  {
    name: 'uerrno',
    doc: 'Error codes for OSError.',
    members: [
      c('errorcode', 'Dict mapping codes to names.'),
      ...'EACCES EADDRINUSE EAGAIN EALREADY EBADF ECONNABORTED ECONNREFUSED ECONNRESET EEXIST EHOSTUNREACH EINPROGRESS EINVAL EIO EISDIR ENOBUFS ENODEV ENOENT ENOMEM ENOTCONN EOPNOTSUPP EPERM ETIMEDOUT'
        .split(' ')
        .map((n) => c(n)),
    ],
  },
  {
    name: 'utimeq',
    doc: 'Time-ordered queue.',
    members: [k('utimeq', '(size)', 'Methods push, pop, peektime.')],
  },
];

export const PY_MODULE_MAP = new Map(PY_MODULES.map((m) => [m.name, m]));

export const PY_KEYWORDS = [
  'False', 'None', 'True', 'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else',
  'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or',
  'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
];

const BUILTIN_SIGS: Record<string, string> = {
  abs: '(x)', all: '(iterable)', any: '(iterable)', bin: '(x)', callable: '(obj)', chr: '(i)', dir: '(obj=None)',
  divmod: '(a, b)', enumerate: '(iterable, start=0)', eval: '(expr, globals=None, locals=None)',
  exec: '(code, globals=None, locals=None)', filter: '(function, iterable)', getattr: '(obj, name, default)',
  hasattr: '(obj, name)', hash: '(obj)', hex: '(x)', id: '(obj)', input: "(prompt='')", isinstance: '(obj, cls)',
  issubclass: '(cls, base)', iter: '(obj)', len: '(s)', map: '(function, iterable, …)', max: '(iterable or a, b, …)',
  min: '(iterable or a, b, …)', next: '(iterator, default)', oct: '(x)', open: "(name, mode='r')", ord: '(c)',
  pow: '(x, y, z=None)', print: "(*objects, sep=' ', end='\\n')", range: '(start, stop, step=1)', repr: '(obj)',
  reversed: '(seq)', round: '(number, ndigits=None)', setattr: '(obj, name, value)', sorted: '(iterable, key=None, reverse=False)',
  sum: '(iterable, start=0)', zip: '(*iterables)', globals: '()', locals: '()', compile: '(source, filename, mode)',
  delattr: '(obj, name)', help: '(obj)',
};
const BUILTIN_TYPES =
  'bool bytearray bytes classmethod complex dict float frozenset int list memoryview object property set slice staticmethod str super tuple type';
const BUILTIN_CONSTS = 'Ellipsis NotImplemented';
const EXCEPTIONS =
  'ArithmeticError AssertionError AttributeError BaseException EOFError Exception GeneratorExit ImportError IndentationError IndexError KeyboardInterrupt KeyError LookupError MemoryError NameError NotImplementedError OSError OverflowError RuntimeError StopAsyncIteration StopIteration SyntaxError SystemError TypeError UnicodeError ValueError ZeroDivisionError';

export const PY_BUILTINS: PyMember[] = [
  ...Object.entries(BUILTIN_SIGS).map(([n, s]) => f(n, s)),
  ...BUILTIN_TYPES.split(' ').map((n) => k(n)),
  ...BUILTIN_CONSTS.split(' ').map((n) => c(n)),
  ...EXCEPTIONS.split(' ').map((n) => k(n, undefined, 'Exception class.')),
];

/** Methods offered after `.` on a value of unknown type (common str/list/dict methods). */
export const PY_COMMON_METHODS = [
  ...'append clear copy count extend index insert pop remove reverse sort'.split(' '),
  ...'center encode endswith find format isalpha isdigit islower isspace isupper join lower lstrip partition replace rfind rindex rpartition rsplit rstrip split splitlines startswith strip upper'.split(' '),
  ...'fromkeys get items keys popitem setdefault update values'.split(' '),
];
