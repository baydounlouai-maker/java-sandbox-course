// The course: each lesson has an explanation, steps checked against the real program run,
// hints, starter files and a reference solution.

const main = (body, imports = '') => `${imports}public class Main {
    public static void main(String[] args) {
${body}
    }
}
`;

const START = main('        // Write your code here\n');

const isDark = (hex) => {
  if (!hex || hex[0] !== '#') return false;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 90;
};

// ---- shared class code used as starters for later lessons ----
const MONSTER_BASE = `public class Monster {
    protected String name;
    protected String color;
    protected double height;
    protected double x;
    protected double z;

    public Monster(String name, String color, double height, double x, double z) {
        this.name = name;
        this.color = color;
        this.height = height;
        this.x = x;
        this.z = z;
    }

    public String speak() {
        return "...";
    }
}
`;

const ZOMBIE_BASE = `public class Zombie extends Monster {
    private int brainsEaten = 0;

    public Zombie(String name, double x, double z) {
        super(name, "#6abf4b", 1.8, x, z);
    }
}
`;

const SKELETON_BASE = `public class Skeleton extends Monster {
    public Skeleton(String name, double x, double z) {
        super(name, "#f2efe6", 1.9, x, z);
    }
}
`;

const ABSTRACT_MONSTER = `public abstract class Monster {
    protected String name;
    protected String color;
    protected double height;
    protected double x;
    protected double z;

    public Monster(String name, String color, double height, double x, double z) {
        this.name = name;
        this.color = color;
        this.height = height;
        this.x = x;
        this.z = z;
    }

    public abstract String speak();

    public String introduce() {
        return name + " says " + speak();
    }
}
`;

export const LESSONS = [
  // ------------------------------------------------------------ 1
  {
    id: 'hello',
    unit: 'Basics',
    title: 'Hello, World!',
    intro: `
      <p>Every Java program starts running at <code>main</code>. The lines between its <code>{ }</code> run from top to bottom.</p>
      <p><code>System.out.println("...")</code> prints a line of text to the <b>Output</b> panel. Text in Java goes inside double quotes and is called a <b>String</b>.</p>
      <p>Your island also has a narrator. <code>World.say("...")</code> shows a speech bubble in the 3D world.</p>`,
    concepts: [
      { code: 'System.out.println("Hi");', text: 'print a line' },
      { code: 'World.say("Hi");', text: 'speech bubble in the world' },
      { code: ';', text: 'ends every statement' }
    ],
    steps: [
      { text: 'Print exactly <code>Hello, World!</code>', check: (r) => r.line('Hello, World!') || (r.out.some((l) => /hello,?\s*world/i.test(l)) ? 'Close! Check the capital letters and the comma: Hello, World!' : false) },
      { text: 'Print a second line that introduces you, like <code>My name is Sam</code>', check: (r) => r.out.length >= 2 },
      { text: 'Make the narrator say something with <code>World.say(...)</code>', check: (r) => r.says.length >= 1 }
    ],
    hints: [
      'Write each instruction on its own line inside main, and end it with a semicolon <code>;</code>',
      'Example: <code>System.out.println("Hello, World!");</code>'
    ],
    starter: { 'Main.java': START },
    solution: {
      'Main.java': main(`        System.out.println("Hello, World!");
        System.out.println("My name is Sam");
        World.say("Welcome to Java Island!");`)
    }
  },
  // ------------------------------------------------------------ 2
  {
    id: 'variables',
    unit: 'Basics',
    title: 'Variables & types',
    intro: `
      <p>A <b>variable</b> is a named box that holds a value. In Java every variable has a <b>type</b> that says what it can hold:</p>
      <ul>
        <li><code>int</code>: whole numbers like <code>3</code> or <code>-12</code></li>
        <li><code>double</code>: decimals like <code>1.75</code></li>
        <li><code>boolean</code>: <code>true</code> or <code>false</code></li>
        <li><code>String</code>: text like <code>"sunset"</code></li>
      </ul>
      <p>You write the type, a name, then a value: <code>int x = 3;</code> After that you just use the name.</p>
      <p>The world has a few commands to try: <code>World.setSky(color)</code> and <code>World.block(x, z, color)</code>. Colors are Strings: names like <code>"orange"</code> or hex codes like <code>"#ffb37a"</code>.</p>`,
    concepts: [
      { code: 'String sky = "#ffb37a";', text: 'text' },
      { code: 'int x = 2;', text: 'whole number' },
      { code: 'double h = 1.5;', text: 'decimal' },
      { code: 'boolean ok = true;', text: 'yes / no' }
    ],
    steps: [
      { text: 'Store a color in a <code>String</code> variable and pass it to <code>World.setSky(...)</code>', check: (r) => (r.has('var:String') && r.sky ? true : r.sky ? 'Use a String variable for the color.' : false) },
      { text: 'Make two <code>int</code> variables <code>x</code> and <code>z</code> and place a block with <code>World.block(x, z, "red")</code>', check: (r) => r.has('var:int') && r.blocks.length >= 1 },
      { text: 'Create a <code>double</code> and a <code>boolean</code> variable and print both', check: (r) => r.has('var:double') && r.has('var:boolean') && r.out.length >= 2 }
    ],
    hints: [
      'Declare first, use after: <code>String skyColor = "#ffb37a";</code> then <code>World.setSky(skyColor);</code>',
      'You can print a variable directly: <code>System.out.println(isNight);</code>'
    ],
    starter: { 'Main.java': START },
    solution: {
      'Main.java': main(`        String skyColor = "#ffb37a";
        World.setSky(skyColor);

        int x = 2;
        int z = -1;
        World.block(x, z, "red");

        double treeHeight = 3.5;
        boolean isSunny = true;
        System.out.println(treeHeight);
        System.out.println(isSunny);`)
    }
  },
  // ------------------------------------------------------------ 3
  {
    id: 'math',
    unit: 'Basics',
    title: 'Math & operators',
    intro: `
      <p>Java can calculate with <code>+ - * /</code> and <code>%</code> (the remainder after dividing).</p>
      <p>Watch out: when both numbers are <code>int</code>, division drops the decimals. <code>7 / 2</code> is <code>3</code>, but <code>7.0 / 2</code> is <code>3.5</code>.</p>
      <p>You can glue text and numbers together with <code>+</code>: <code>"Area: " + area</code>.</p>
      <p>Plant flowers with <code>World.flower(x, z, color)</code>.</p>`,
    concepts: [
      { code: 'int area = w * d;', text: 'multiply' },
      { code: '7 / 2', text: '= 3 (whole numbers)' },
      { code: '7 % 2', text: '= 1 (remainder)' },
      { code: '"Area: " + area', text: 'join text and numbers' }
    ],
    steps: [
      { text: 'A garden is <code>7</code> wide and <code>4</code> deep. Store those in variables and print <code>Area: 28</code> using <code>*</code>', check: (r) => (r.line('Area: 28') && r.has('var:int') ? true : false) },
      { text: 'Print <code>Perimeter: 22</code> (all four sides added up)', check: (r) => r.line('Perimeter: 22') },
      { text: 'Find the middle with <code>width / 2</code> and plant a flower there: <code>World.flower(middle, 0, "yellow")</code>', check: (r) => (r.flowers.some((f) => f.x === 3) ? true : r.flowers.length ? 'The middle of 7 with int division is 3.' : false) },
      { text: 'Use <code>%</code> to print whether the width is odd: <code>Odd width: true</code>', check: (r) => r.has('modulo') && r.line('Odd width: true') }
    ],
    hints: [
      '<code>int width = 7; int depth = 4; int area = width * depth;</code>',
      'A number is odd when <code>width % 2 == 1</code>. You can print that comparison directly: <code>"Odd width: " + (width % 2 == 1)</code>'
    ],
    starter: { 'Main.java': START },
    solution: {
      'Main.java': main(`        int width = 7;
        int depth = 4;
        int area = width * depth;
        int perimeter = 2 * (width + depth);
        System.out.println("Area: " + area);
        System.out.println("Perimeter: " + perimeter);

        int middle = width / 2;
        World.flower(middle, 0, "yellow");

        System.out.println("Odd width: " + (width % 2 == 1));`)
    }
  },
  // ------------------------------------------------------------ 4
  {
    id: 'strings',
    unit: 'Basics',
    title: 'Strings',
    intro: `
      <p>Strings are objects, so they come with <b>methods</b> you call with a dot:</p>
      <ul>
        <li><code>name.length()</code> gives the number of characters</li>
        <li><code>name.toUpperCase()</code> gives a SHOUTING copy</li>
        <li><code>name.charAt(0)</code> gives the first character (counting starts at 0)</li>
        <li><code>name.equals("bob")</code> compares text. Don't use <code>==</code> for Strings.</li>
      </ul>`,
    concepts: [
      { code: 'name.length()', text: 'how many letters' },
      { code: 'name.toUpperCase()', text: 'BIG LETTERS' },
      { code: 'name.charAt(0)', text: 'first letter' },
      { code: 'a.equals(b)', text: 'same text?' }
    ],
    steps: [
      { text: 'Make <code>String name</code> with a zombie name in lowercase, like <code>"bob"</code>', check: (r) => r.has('var:String') },
      { text: 'Print a greeting in capitals made with <code>toUpperCase()</code>, like <code>HELLO, BOB!</code>', check: (r) => r.has('call:toUpperCase') && r.out.some((l) => /^HELLO, [A-Z ]+!$/.test(l.trim())) },
      { text: 'Print how long the name is, like <code>bob has 3 letters</code>', check: (r) => { const m = r.lineMatch(/^(\S.*) has (\d+) letters$/); return !!m && m[1].length === Number(m[2]) && r.has('call:length'); } },
      { text: 'Make the narrator say the name\'s first letter with <code>charAt(0)</code>', check: (r) => r.has('call:charAt') && r.says.length > 0 }
    ],
    hints: [
      'You can call a method inside the + : <code>"HELLO, " + name.toUpperCase() + "!"</code>',
      'A char glued to a String becomes text: <code>World.say("It starts with " + name.charAt(0));</code>'
    ],
    starter: { 'Main.java': START },
    solution: {
      'Main.java': main(`        String name = "bob";
        System.out.println("HELLO, " + name.toUpperCase() + "!");
        System.out.println(name + " has " + name.length() + " letters");
        World.say("Your name starts with " + name.charAt(0));`)
    }
  },
  // ------------------------------------------------------------ 5
  {
    id: 'conditions',
    unit: 'Basics',
    title: 'If & else',
    intro: `
      <p><code>if</code> runs code only when a condition is <code>true</code>. <code>else</code> runs when it's not.</p>
      <p>Conditions compare values: <code>==</code> equal, <code>!=</code> not equal, <code>&lt; &gt; &lt;= &gt;=</code>. Combine them with <code>&amp;&amp;</code> (and) and <code>||</code> (or).</p>
      <pre>if (hour >= 20 || hour < 6) {
    // night
} else if (hour >= 17) {
    // evening
} else {
    // day
}</pre>`,
    concepts: [
      { code: 'if (x > 3) { }', text: 'only when true' },
      { code: 'else if (...)', text: 'another option' },
      { code: '&& ||', text: 'and, or' }
    ],
    steps: [
      { text: 'Make <code>int hour = 22;</code> and use <code>if</code>/<code>else</code>: at night set a dark sky and print <code>Good night!</code>, otherwise print <code>Good morning!</code>', check: (r) => r.has('if') && r.has('else') && r.line('Good night!') && isDark(r.sky) ? true : (r.line('Good night!') && !isDark(r.sky) ? 'Night needs a dark sky color, like "#1b2340".' : false) },
      { text: 'Night is <code>hour >= 20</code> <b>or</b> <code>hour < 6</code>. Use <code>||</code> to check both', check: (r) => r.has('or') },
      { text: 'Add an <code>else if</code> for evening (17 to 19): orange sky and <code>Good evening!</code>. Try changing <code>hour</code> to 18!', check: (r) => r.has('else-if') }
    ],
    hints: [
      'Night colors: <code>"#1b2340"</code> or <code>"midnightblue"</code>. Day: <code>"#8fd3ff"</code>.',
      'Order matters: check night first, then <code>else if (hour >= 17)</code>, then <code>else</code>.'
    ],
    starter: { 'Main.java': START },
    solution: {
      'Main.java': main(`        int hour = 22;
        if (hour >= 20 || hour < 6) {
            World.setSky("#1b2340");
            System.out.println("Good night!");
        } else if (hour >= 17) {
            World.setSky("orange");
            System.out.println("Good evening!");
        } else {
            World.setSky("#8fd3ff");
            System.out.println("Good morning!");
        }`)
    }
  },
  // ------------------------------------------------------------ 6
  {
    id: 'loops',
    unit: 'Basics',
    title: 'Loops',
    intro: `
      <p>Loops repeat code. A <code>for</code> loop counts:</p>
      <pre>for (int i = 0; i < 5; i++) {
    // runs with i = 0, 1, 2, 3, 4
}</pre>
      <p>A <code>while</code> loop repeats as long as its condition is true.</p>
      <p><code>World.block(x, y, z, color)</code> places a block at a height <code>y</code>, so you can stack blocks.</p>`,
    concepts: [
      { code: 'for (int i = 0; i < n; i++)', text: 'count from 0 to n-1' },
      { code: 'while (x > 0)', text: 'repeat while true' },
      { code: 'i++', text: 'add 1' }
    ],
    steps: [
      { text: 'Build a tower 10 blocks tall at <code>(0, 0)</code> with a <code>for</code> loop and <code>World.block(0, y, 0, color)</code>', check: (r) => { const c = r.columns().get('0,0'); return r.has('for') && c && c.size >= 10 ? true : c ? `The tower is ${c.size} blocks tall.` : false; } },
      { text: 'Plant a row of at least 5 trees with a loop: <code>World.tree(x, -4)</code>', check: (r) => r.trees.length >= 5 },
      { text: 'Use a <code>while</code> loop to count down: print <code>3</code>, <code>2</code>, <code>1</code> and then <code>Liftoff!</code>', check: (r) => { const i = r.out.findIndex((l) => l.trim() === '3'); return r.has('while') && i >= 0 && r.out[i + 1]?.trim() === '2' && r.out[i + 2]?.trim() === '1' && r.out[i + 3]?.trim() === 'Liftoff!'; } }
    ],
    hints: [
      'Use the loop counter as the height: <code>World.block(0, y, 0, "orange");</code> inside <code>for (int y = 0; y < 10; y++)</code>',
      'Count down: <code>int n = 3; while (n > 0) { System.out.println(n); n--; }</code>'
    ],
    starter: { 'Main.java': START },
    solution: {
      'Main.java': main(`        for (int y = 0; y < 10; y++) {
            World.block(0, y, 0, "orange");
        }

        for (int x = -8; x <= 8; x += 4) {
            World.tree(x, -4);
        }

        int n = 3;
        while (n > 0) {
            System.out.println(n);
            n--;
        }
        System.out.println("Liftoff!");`)
    }
  },
  // ------------------------------------------------------------ 7
  {
    id: 'methods',
    unit: 'Basics',
    title: 'Methods',
    intro: `
      <p>A <b>method</b> is a named piece of code you can run again and again. It can take <b>parameters</b> (inputs) and <b>return</b> a value.</p>
      <pre>static void tower(int x, int z, int height) {
    // build it here
}

static int area(int w, int d) {
    return w * d;
}</pre>
      <p>Methods go inside the class, next to <code>main</code> (not inside it). For now, mark them <code>static</code>.</p>`,
    concepts: [
      { code: 'static void name(int a) { }', text: 'does something' },
      { code: 'static int name() { return 5; }', text: 'gives back a value' },
      { code: 'tower(3, 0, 5);', text: 'call it' }
    ],
    steps: [
      { text: 'Write <code>static void tower(int x, int z, int height, String color)</code> that stacks blocks', check: (r) => { const m = r.method('Main', 'tower'); return !!m && m.isStatic && m.params.length >= 3; } },
      { text: 'Call <code>tower</code> at least 3 times to build three towers', check: (r) => { const n = [...r.columns().values()].filter((s) => s.size >= 2).length; return n >= 3 ? true : n ? `${n} tower(s) so far.` : false; } },
      { text: 'Write a method that <b>returns</b> a value, like <code>static int totalBlocks(int a, int b, int c)</code>, and print its result', check: (r) => { const c = r.cls('Main'); return !!c && c.methods.some((m) => m.isStatic && m.name !== 'main' && m.ret !== 'void') && r.out.length > 0; } }
    ],
    hints: [
      'Inside tower: <code>for (int y = 0; y < height; y++) { World.block(x, y, z, color); }</code>',
      'Then call it from main: <code>tower(-4, 0, 3, "red");</code>'
    ],
    starter: { 'Main.java': main('        // Call your methods here\n').replace('    }\n}\n', '    }\n\n    // Write your methods here\n}\n') },
    solution: {
      'Main.java': `public class Main {
    public static void main(String[] args) {
        tower(-4, 0, 3, "red");
        tower(0, 0, 6, "gold");
        tower(4, 0, 4, "royalblue");
        System.out.println("Blocks used: " + totalBlocks(3, 6, 4));
    }

    static void tower(int x, int z, int height, String color) {
        for (int y = 0; y < height; y++) {
            World.block(x, y, z, color);
        }
    }

    static int totalBlocks(int a, int b, int c) {
        return a + b + c;
    }
}
`
    }
  },
  // ------------------------------------------------------------ 8
  {
    id: 'arrays',
    unit: 'Basics',
    title: 'Arrays',
    intro: `
      <p>An <b>array</b> holds many values of the same type in a row:</p>
      <pre>String[] colors = {"red", "orange", "yellow"};
int[] heights = new int[5];   // five zeros</pre>
      <p>Get one item with an index that starts at 0: <code>colors[0]</code> is <code>"red"</code>. The number of items is <code>colors.length</code>, so the last index is <code>colors.length - 1</code>.</p>`,
    concepts: [
      { code: 'int[] a = {4, 7, 2};', text: 'make an array' },
      { code: 'a[0]', text: 'first item' },
      { code: 'a.length', text: 'how many' }
    ],
    steps: [
      { text: 'Make a <code>String[]</code> of at least 6 colors and a loop over <code>colors.length</code> that places a block of each color', check: (r) => { const n = new Set(r.blocks.map((b) => b.color)).size; return r.has('array-length') && n >= 6 ? true : n ? `${n} different colors so far.` : false; } },
      { text: 'Make an <code>int[] heights</code> and build a column for each one using a loop inside a loop', check: (r) => r.has('nested-loop') && [...r.columns().values()].filter((s) => s.size >= 2).length >= 3 },
      { text: 'Find the tallest height with a loop and print it, like <code>Tallest: 7</code>', check: (r) => { const m = r.lineMatch(/^Tallest: (\d+)$/); const max = Math.max(0, ...[...r.columns().values()].map((s) => s.size)); return !!m && Number(m[1]) === max ? true : m ? `Your tallest column has ${max} blocks.` : false; } }
    ],
    hints: [
      '<code>for (int i = 0; i < colors.length; i++) { World.block(i, 3, colors[i]); }</code>',
      'Keep a <code>max</code> variable and update it: <code>if (heights[i] > max) { max = heights[i]; }</code>'
    ],
    starter: { 'Main.java': START },
    solution: {
      'Main.java': main(`        String[] colors = {"red", "orange", "yellow", "green", "blue", "purple"};
        for (int i = 0; i < colors.length; i++) {
            World.block(i - 3, 4, colors[i]);
        }

        int[] heights = {2, 5, 3, 7, 4};
        for (int i = 0; i < heights.length; i++) {
            for (int y = 0; y < heights[i]; y++) {
                World.block(i - 2, y, -3, "gray");
            }
        }

        int max = 0;
        for (int h : heights) {
            if (h > max) {
                max = h;
            }
        }
        System.out.println("Tallest: " + max);`)
    }
  },
  // ------------------------------------------------------------ 9
  {
    id: 'classes',
    unit: 'Objects',
    title: 'Your first class',
    intro: `
      <p>A <b>class</b> is a blueprint. It lists the <b>fields</b> (data) every object of that kind has. <code>new</code> builds an <b>object</b> from the blueprint.</p>
      <pre>public class Zombie {
    String name;
    String color;
    double height;
}</pre>
      <p>In <code>main</code>: <code>Zombie bob = new Zombie();</code> then set its fields with a dot: <code>bob.height = 1.8;</code></p>
      <p><b>The world reads your fields!</b> Add an object with <code>World.add(bob)</code>. A class named <code>Zombie</code> looks like a zombie, and fields called <code>color</code>, <code>height</code> and <code>name</code> change how it looks. Click it in the world to inspect it.</p>`,
    concepts: [
      { code: 'class Zombie { }', text: 'a blueprint' },
      { code: 'new Zombie()', text: 'build an object' },
      { code: 'bob.height = 2.1;', text: 'set a field' },
      { code: 'World.add(bob);', text: 'put it in the world' }
    ],
    steps: [
      { text: 'In <code>Zombie.java</code>, write a <code>Zombie</code> class with fields <code>name</code>, <code>color</code> (Strings) and <code>height</code> (a double)', check: (r) => { const c = r.cls('Zombie'); return !!c && r.field('Zombie', 'name')?.type === 'String' && r.field('Zombie', 'color')?.type === 'String' && r.field('Zombie', 'height')?.type === 'double'; } },
      { text: 'In <code>main</code>, create a zombie, give it a name, color and height, and add it to the world', check: (r) => r.ofClass('Zombie').some((e) => e.props.name && e.props.color && e.props.height) },
      { text: 'Add a second zombie that is taller and a different color', check: (r) => { const z = r.ofClass('Zombie'); return z.length >= 2 && new Set(z.map((e) => e.props.color)).size >= 2 && new Set(z.map((e) => e.props.height)).size >= 2; } }
    ],
    hints: [
      'Zombie.java: <code>public class Zombie { String name; String color; double height; }</code> (one field per line looks nicer)',
      'Main: <code>Zombie bob = new Zombie(); bob.name = "Bob"; bob.color = "#6abf4b"; bob.height = 1.8; World.add(bob);</code>'
    ],
    starter: {
      'Main.java': START,
      'Zombie.java': '// Write the Zombie class here\n'
    },
    solution: {
      'Main.java': main(`        Zombie bob = new Zombie();
        bob.name = "Bob";
        bob.color = "#6abf4b";
        bob.height = 1.8;
        World.add(bob);

        Zombie tina = new Zombie();
        tina.name = "Tina";
        tina.color = "#8fbcd4";
        tina.height = 2.3;
        World.add(tina);`),
      'Zombie.java': `public class Zombie {
    String name;
    String color;
    double height;
}
`
    }
  },
  // ------------------------------------------------------------ 10
  {
    id: 'constructors',
    unit: 'Objects',
    title: 'Constructors',
    intro: `
      <p>Setting every field by hand is slow. A <b>constructor</b> sets them up while the object is being built. It has the same name as the class and no return type:</p>
      <pre>public Zombie(String name, String color, double height) {
    this.name = name;
    this.color = color;
    this.height = height;
}</pre>
      <p><code>this.name</code> is the field; <code>name</code> on its own is the parameter. Now <code>new Zombie("Bob", "green", 1.8)</code> does it all in one line.</p>
      <p>A class can have several constructors with different parameters. One can call another with <code>this(...)</code>.</p>
      <p>Add <code>double x</code> and <code>double z</code> fields to choose where each zombie stands.</p>`,
    concepts: [
      { code: 'public Zombie(...) { }', text: 'runs on new' },
      { code: 'this.name = name;', text: 'field = parameter' },
      { code: 'this(name, "green", 1.8);', text: 'call another constructor' }
    ],
    steps: [
      { text: 'Give <code>Zombie</code> a constructor with parameters for name, color and height that uses <code>this.</code>', check: (r) => { const c = r.cls('Zombie'); return !!c && c.ctors.some((k) => k.params.length >= 3) && r.has('this-field'); } },
      { text: 'Add <code>x</code> and <code>z</code> fields and create 3 zombies standing in different places', check: (r) => { const z = r.ofClass('Zombie'); return z.length >= 3 && new Set(z.map((e) => `${e.props.x},${e.props.z}`)).size >= 3 ? true : z.length ? `${z.length} zombie(s) in different places so far.` : false; } },
      { text: 'Add a second, shorter constructor <code>Zombie(String name)</code> that calls <code>this(...)</code> with default values, and use it', check: (r) => { const c = r.cls('Zombie'); return !!c && c.ctors.length >= 2 && c.ctors.some((k) => k.params.length === 1); } }
    ],
    hints: [
      'With x and z: <code>public Zombie(String name, String color, double height, double x, double z)</code>',
      'Short one: <code>public Zombie(String name) { this(name, "#6abf4b", 1.8, 0, 3); }</code>'
    ],
    starter: {
      'Main.java': main(`        Zombie bob = new Zombie();
        bob.name = "Bob";
        bob.color = "#6abf4b";
        bob.height = 1.8;
        World.add(bob);`),
      'Zombie.java': `public class Zombie {
    String name;
    String color;
    double height;
}
`
    },
    solution: {
      'Main.java': main(`        World.add(new Zombie("Bob", "#6abf4b", 1.8, -3, 0));
        World.add(new Zombie("Tina", "#8fbcd4", 2.2, 0, 0));
        World.add(new Zombie("Gus", "#b07ad6", 1.4, 3, 0));
        World.add(new Zombie("Pip"));`),
      'Zombie.java': `public class Zombie {
    String name;
    String color;
    double height;
    double x;
    double z;

    public Zombie(String name, String color, double height, double x, double z) {
        this.name = name;
        this.color = color;
        this.height = height;
        this.x = x;
        this.z = z;
    }

    public Zombie(String name) {
        this(name, "#6abf4b", 1.8, 0, 3);
    }
}
`
    }
  },
  // ------------------------------------------------------------ 11
  {
    id: 'object-methods',
    unit: 'Objects',
    title: 'Methods on objects',
    intro: `
      <p>Methods that are <b>not</b> static belong to each object and can use its fields. Calling <code>bob.grow()</code> changes only Bob.</p>
      <pre>public void grow() {
    height = height + 0.25;
}</pre>
      <p>To animate, change fields and then wait with <code>World.pause(seconds)</code>. The world smoothly moves from one pause to the next.</p>`,
    concepts: [
      { code: 'public void grow() { }', text: 'an object method' },
      { code: 'bob.grow();', text: 'run it on Bob' },
      { code: 'World.pause(0.5);', text: 'wait, so you can see it' }
    ],
    steps: [
      { text: 'Add a method <code>grow()</code> to <code>Zombie</code> that makes it taller', check: (r) => { const o = r.objectsOf('Zombie')[0]; if (!o || !r.method('Zombie', 'grow', 0)) return false; const h0 = r.get(o, 'height'); r.call(o, 'grow'); return r.get(o, 'height') > h0 ? true : 'grow() should make height bigger.'; } },
      { text: 'Add <code>moveTo(double x, double z)</code> that changes where the zombie stands', check: (r) => { const o = r.objectsOf('Zombie')[0]; if (!o || !r.method('Zombie', 'moveTo', 2)) return false; r.call(o, 'moveTo', [4.5, -2.5]); return r.get(o, 'x') === 4.5 && r.get(o, 'z') === -2.5; } },
      { text: 'In <code>main</code>, use a loop with <code>World.pause</code> to animate a zombie growing or walking', check: (r) => r.has('call:World.pause') && r.entities.some((e) => e.keys.length >= 3 && new Set(e.keys.map((k) => `${k.props.height},${k.props.x},${k.props.z}`)).size >= 3) }
    ],
    hints: [
      'Inside the class, fields can be used directly: <code>public void moveTo(double x, double z) { this.x = x; this.z = z; }</code>',
      '<code>for (int i = 0; i < 4; i++) { bob.grow(); World.pause(0.5); }</code>'
    ],
    starter: {
      'Main.java': main(`        Zombie bob = new Zombie("Bob", "#6abf4b", 1.8, 0, 0);
        World.add(bob);`),
      'Zombie.java': `public class Zombie {
    String name;
    String color;
    double height;
    double x;
    double z;

    public Zombie(String name, String color, double height, double x, double z) {
        this.name = name;
        this.color = color;
        this.height = height;
        this.x = x;
        this.z = z;
    }
}
`
    },
    solution: {
      'Main.java': main(`        Zombie bob = new Zombie("Bob", "#6abf4b", 1.8, -4, 0);
        World.add(bob);
        for (int i = 0; i < 4; i++) {
            bob.grow();
            bob.moveTo(bob.x + 2, 0);
            World.pause(0.5);
        }`),
      'Zombie.java': `public class Zombie {
    String name;
    String color;
    double height;
    double x;
    double z;

    public Zombie(String name, String color, double height, double x, double z) {
        this.name = name;
        this.color = color;
        this.height = height;
        this.x = x;
        this.z = z;
    }

    public void grow() {
        height = height + 0.25;
    }

    public void moveTo(double x, double z) {
        this.x = x;
        this.z = z;
    }
}
`
    }
  },
  // ------------------------------------------------------------ 12
  {
    id: 'encapsulation',
    unit: 'Objects',
    title: 'Encapsulation',
    intro: `
      <p>Right now any code can set <code>bob.height = 25;</code> and make a 25-meter zombie. <b>Encapsulation</b> protects an object's data:</p>
      <ol>
        <li>Make fields <code>private</code>, so only the class itself can touch them.</li>
        <li>Add public <b>getters</b> to read them: <code>getHeight()</code>.</li>
        <li>Add <b>setters</b> that check the new value first: <code>setHeight(double h)</code>.</li>
      </ol>`,
    concepts: [
      { code: 'private double height;', text: 'hidden from other classes' },
      { code: 'public double getHeight()', text: 'getter' },
      { code: 'public void setHeight(double h)', text: 'setter with checks' }
    ],
    steps: [
      { text: 'Make every field in <code>Zombie</code> <code>private</code>', check: (r) => { const c = r.cls('Zombie'); return !!c && c.fields.length > 0 && c.fields.every((f) => f.access === 'private'); } },
      { text: 'Add getters <code>getName()</code> and <code>getHeight()</code>', check: (r) => !!r.method('Zombie', 'getName', 0) && r.method('Zombie', 'getHeight', 0)?.ret === 'double' },
      { text: 'Add <code>setHeight(double h)</code> that only accepts heights from 0.5 to 3.0 and keeps the old height otherwise', check: (r) => {
        const o = r.objectsOf('Zombie')[0];
        if (!o || !r.method('Zombie', 'setHeight', 1)) return false;
        r.call(o, 'setHeight', [2.0]);
        if (r.call(o, 'getHeight').value !== 2.0) return 'setHeight(2.0) should change the height to 2.0';
        r.call(o, 'setHeight', [25]);
        if (r.call(o, 'getHeight').value !== 2.0) return 'setHeight(25) should be refused';
        r.call(o, 'setHeight', [-1]);
        if (r.call(o, 'getHeight').value !== 2.0) return 'setHeight(-1) should be refused';
        r.call(o, 'setHeight', [3.0]);
        return r.call(o, 'getHeight').value === 3.0 ? true : '3.0 itself should be allowed';
      } },
      { text: 'Fix <code>main</code> so it uses <code>setHeight</code> instead of changing the field directly', check: (r) => r.has('call:setHeight') }
    ],
    hints: [
      'Getter: <code>public double getHeight() { return height; }</code>',
      'Setter: <code>if (h >= 0.5 &amp;&amp; h <= 3.0) { height = h; } else { System.out.println("Too big!"); }</code>'
    ],
    starter: {
      'Main.java': main(`        Zombie bob = new Zombie("Bob", "#6abf4b", 1.8, 0, 0);
        bob.height = 25;   // a 25 meter zombie?! Protect the field.
        World.add(bob);`),
      'Zombie.java': `public class Zombie {
    String name;
    String color;
    double height;
    double x;
    double z;

    public Zombie(String name, String color, double height, double x, double z) {
        this.name = name;
        this.color = color;
        this.height = height;
        this.x = x;
        this.z = z;
    }
}
`
    },
    solution: {
      'Main.java': main(`        Zombie bob = new Zombie("Bob", "#6abf4b", 1.8, 0, 0);
        bob.setHeight(25);
        bob.setHeight(2.4);
        System.out.println(bob.getName() + " is " + bob.getHeight() + "m tall");
        World.add(bob);`),
      'Zombie.java': `public class Zombie {
    private String name;
    private String color;
    private double height;
    private double x;
    private double z;

    public Zombie(String name, String color, double height, double x, double z) {
        this.name = name;
        this.color = color;
        this.height = height;
        this.x = x;
        this.z = z;
    }

    public String getName() {
        return name;
    }

    public double getHeight() {
        return height;
    }

    public void setHeight(double h) {
        if (h >= 0.5 && h <= 3.0) {
            height = h;
        } else {
            System.out.println("A zombie can't be " + h + "m tall!");
        }
    }
}
`
    }
  },
  // ------------------------------------------------------------ 13
  {
    id: 'static',
    unit: 'Objects',
    title: 'static & final',
    intro: `
      <p>A <code>static</code> field belongs to the <b>class</b>, not to each object. All zombies share one copy, which makes it handy for counting them.</p>
      <p><code>final</code> means the value can never change. <code>static final</code> fields are constants, named in CAPITALS by convention.</p>
      <pre>private static int count = 0;
public static final double MAX_HEIGHT = 3.0;</pre>
      <p>Call static methods on the class itself: <code>Zombie.getCount()</code>.</p>`,
    concepts: [
      { code: 'static int count;', text: 'one shared copy' },
      { code: 'static final double MAX = 3.0;', text: 'a constant' },
      { code: 'Zombie.getCount()', text: 'call on the class' }
    ],
    steps: [
      { text: 'Add <code>private static int count</code> and increase it in the constructor', check: (r) => !!r.cls('Zombie')?.fields.some((f) => f.isStatic && !f.isFinal && f.type === 'int') },
      { text: 'Add <code>public static int getCount()</code> that returns the count', check: (r) => { const m = r.method('Zombie', 'getCount', 0); return !!m && m.isStatic && m.ret === 'int'; } },
      { text: 'Add a constant <code>MAX_HEIGHT = 3.0</code> with <code>static final</code> and use it in <code>setHeight</code>', check: (r) => !!r.cls('Zombie')?.fields.some((f) => f.isStatic && f.isFinal && f.type === 'double') },
      { text: 'Create 5 zombies in a loop and print <code>Zombies: 5</code> using <code>Zombie.getCount()</code>', check: (r) => { const m = r.lineMatch(/^Zombies: (\d+)$/); const n = r.ofClass('Zombie').length; return !!m && n >= 5 && Number(m[1]) === n && r.has('call:Zombie.getCount') ? true : m ? `There are ${n} zombies in the world.` : false; } }
    ],
    hints: [
      'In the constructor: <code>count++;</code>',
      'In main: <code>for (int i = 0; i < 5; i++) { World.add(new Zombie("Z" + i, "#6abf4b", 1.8, i * 2 - 4, 0)); }</code>'
    ],
    starter: {
      'Main.java': START,
      'Zombie.java': `public class Zombie {
    private String name;
    private String color;
    private double height;
    private double x;
    private double z;

    public Zombie(String name, String color, double height, double x, double z) {
        this.name = name;
        this.color = color;
        this.height = height;
        this.x = x;
        this.z = z;
    }

    public double getHeight() {
        return height;
    }

    public void setHeight(double h) {
        if (h >= 0.5 && h <= 3.0) {
            height = h;
        }
    }
}
`
    },
    solution: {
      'Main.java': main(`        for (int i = 0; i < 5; i++) {
            World.add(new Zombie("Z" + i, "#6abf4b", 1.4 + i * 0.2, i * 2 - 4, 0));
        }
        System.out.println("Zombies: " + Zombie.getCount());`),
      'Zombie.java': `public class Zombie {
    public static final double MAX_HEIGHT = 3.0;
    private static int count = 0;

    private String name;
    private String color;
    private double height;
    private double x;
    private double z;

    public Zombie(String name, String color, double height, double x, double z) {
        this.name = name;
        this.color = color;
        this.height = height;
        this.x = x;
        this.z = z;
        count++;
    }

    public static int getCount() {
        return count;
    }

    public double getHeight() {
        return height;
    }

    public void setHeight(double h) {
        if (h >= 0.5 && h <= MAX_HEIGHT) {
            height = h;
        }
    }
}
`
    }
  },
  // ------------------------------------------------------------ 14
  {
    id: 'inheritance',
    unit: 'Inheritance',
    title: 'A Zombie is a Monster',
    intro: `
      <p>Zombies and skeletons both have a name, a color, a height and a position. Instead of copying those fields into every class, put them in a parent class <code>Monster</code> and let the others <b>inherit</b> them with <code>extends</code>:</p>
      <pre>public class Zombie extends Monster {
    public Zombie(String name, double x, double z) {
        super(name, "#6abf4b", 1.8, x, z);
    }
}</pre>
      <p><code>super(...)</code> runs Monster's constructor first. It must be the first line. Use <code>protected</code> fields in Monster so subclasses can use them.</p>`,
    concepts: [
      { code: 'class Zombie extends Monster', text: 'Zombie gets all of Monster' },
      { code: 'super(...)', text: "run the parent's constructor" },
      { code: 'protected', text: 'visible to subclasses' }
    ],
    steps: [
      { text: 'Write a <code>Monster</code> class with fields name, color, height, x and z, and a constructor that sets them', check: (r) => { const c = r.cls('Monster'); return !!c && ['name', 'color', 'height', 'x', 'z'].every((f) => r.field('Monster', f)) && c.ctors.some((k) => k.params.length >= 3); } },
      { text: 'Make <code>Zombie extends Monster</code>, calling <code>super(...)</code> and without its own name/color/height fields', check: (r) => { const c = r.cls('Zombie'); return !!c && c.superName === 'Monster' && r.has('super-ctor') && !['name', 'color', 'height'].some((f) => r.field('Zombie', f)) ? true : c && c.superName === 'Monster' ? 'Zombie should not repeat the fields Monster already has.' : false; } },
      { text: 'Make <code>Skeleton extends Monster</code> too', check: (r) => r.cls('Skeleton')?.superName === 'Monster' },
      { text: 'Add a zombie and a skeleton to the world', check: (r) => r.ofClass('Zombie').length >= 1 && r.ofClass('Skeleton').length >= 1 }
    ],
    hints: [
      'Monster.java: fields like <code>protected String name;</code> and a constructor <code>public Monster(String name, String color, double height, double x, double z)</code>',
      'Skeleton.java: <code>public class Skeleton extends Monster { public Skeleton(String name, double x, double z) { super(name, "#f2efe6", 1.9, x, z); } }</code>'
    ],
    starter: {
      'Main.java': START,
      'Monster.java': '// Write the Monster class here\n',
      'Zombie.java': '// Write Zombie here. It should extend Monster.\n',
      'Skeleton.java': '// Write Skeleton here. It should extend Monster.\n'
    },
    solution: {
      'Main.java': main(`        World.add(new Zombie("Bob", -2, 0));
        World.add(new Skeleton("Bones", 2, 0));`),
      'Monster.java': MONSTER_BASE,
      'Zombie.java': ZOMBIE_BASE,
      'Skeleton.java': SKELETON_BASE
    }
  },
  // ------------------------------------------------------------ 15
  {
    id: 'polymorphism',
    unit: 'Inheritance',
    title: 'Overriding & polymorphism',
    intro: `
      <p>A subclass can <b>override</b> a method to do it its own way. Mark it with <code>@Override</code> so Java checks you got the name right:</p>
      <pre>@Override
public String speak() {
    return "Braaains...";
}</pre>
      <p><b>Polymorphism</b>: a <code>Monster</code> variable can hold a Zombie or a Skeleton, and <code>m.speak()</code> runs the right version for the actual object.</p>
      <pre>Monster[] monsters = { new Zombie("Bob", 0, 0), new Skeleton("Bones", 2, 0) };</pre>
      <p><code>World.say(m, text)</code> shows a speech bubble over a monster. Clicking a monster in the world also calls its <code>speak()</code>.</p>`,
    concepts: [
      { code: '@Override', text: 'replace an inherited method' },
      { code: 'Monster m = new Zombie(...);', text: 'parent type, child object' },
      { code: 'm.speak()', text: "runs the object's own version" }
    ],
    steps: [
      { text: 'Override <code>speak()</code> in <code>Zombie</code> with <code>@Override</code>', check: (r) => r.method('Zombie', 'speak', 0)?.override === true },
      { text: 'Override <code>speak()</code> in <code>Skeleton</code> so it says something different', check: (r) => { const z = r.objectsOf('Zombie')[0]; const s = r.objectsOf('Skeleton')[0]; if (!r.method('Skeleton', 'speak', 0)) return false; if (!z || !s) return 'Add a zombie and a skeleton to the world.'; return r.call(z, 'speak').value !== r.call(s, 'speak').value; } },
      { text: 'Put several monsters in a <code>Monster[]</code> array and loop over it, adding each one and making it <code>World.say(m, m.speak())</code>', check: (r) => (r.has('var:Monster[]') || r.has('var:ArrayList<Monster>')) && new Set(r.says.filter((s) => s.id).map((s) => s.text)).size >= 2 },
      { text: 'Write a new <code>Slime</code> class that extends Monster with its own <code>speak()</code>, and add one to the array', check: (r) => r.cls('Slime')?.superName === 'Monster' && !!r.method('Slime', 'speak', 0) && r.ofClass('Slime').length > 0 }
    ],
    hints: [
      'In Zombie.java add: <code>@Override public String speak() { return "Braaains..."; }</code>',
      '<code>for (Monster m : monsters) { World.add(m); World.say(m, m.speak()); World.pause(1); }</code>'
    ],
    starter: {
      'Main.java': START,
      'Monster.java': MONSTER_BASE,
      'Zombie.java': ZOMBIE_BASE,
      'Skeleton.java': SKELETON_BASE
    },
    solution: {
      'Main.java': main(`        Monster[] monsters = {
            new Zombie("Bob", -3, 0),
            new Skeleton("Bones", 0, 0),
            new Slime("Gloop", 3, 0)
        };
        for (Monster m : monsters) {
            World.add(m);
            World.say(m, m.speak());
            World.pause(1);
        }`),
      'Monster.java': MONSTER_BASE,
      'Zombie.java': ZOMBIE_BASE.replace('    }\n}\n', `    }

    @Override
    public String speak() {
        return "Braaains...";
    }
}
`),
      'Skeleton.java': SKELETON_BASE.replace('    }\n}\n', `    }

    @Override
    public String speak() {
        return "*rattle rattle*";
    }
}
`),
      'Slime.java': `public class Slime extends Monster {
    public Slime(String name, double x, double z) {
        super(name, "#7de38b", 0.9, x, z);
    }

    @Override
    public String speak() {
        return "Blub.";
    }
}
`
    }
  },
  // ------------------------------------------------------------ 16
  {
    id: 'abstract',
    unit: 'Inheritance',
    title: 'Abstract classes',
    intro: `
      <p>What does a plain "Monster" look like or say? Nothing really. Every real monster is a specific kind. Make <code>Monster</code> <b>abstract</b>:</p>
      <pre>public abstract class Monster {
    public abstract String speak();   // no body!
}</pre>
      <ul>
        <li>You can't write <code>new Monster(...)</code> any more. Try it and read the error.</li>
        <li>Every non-abstract subclass <b>must</b> write <code>speak()</code>, or the code won't compile.</li>
        <li>Normal methods in Monster can still call <code>speak()</code>. Each object fills in its own version.</li>
      </ul>`,
    concepts: [
      { code: 'abstract class Monster', text: "can't be created" },
      { code: 'abstract String speak();', text: 'subclasses must write it' }
    ],
    steps: [
      { text: 'Make <code>Monster</code> abstract and turn <code>speak()</code> into an abstract method', check: (r) => r.cls('Monster')?.isAbstract && r.method('Monster', 'speak', 0)?.isAbstract },
      { text: 'Add a normal method <code>introduce()</code> to Monster that returns <code>name + " says " + speak()</code>, and print it for every monster', check: (r) => !!r.method('Monster', 'introduce', 0) && r.out.filter((l) => l.includes(' says ')).length >= 2 },
      { text: 'Write a <code>Ghost</code> class that extends Monster and add one to the world', check: (r) => r.cls('Ghost')?.superName === 'Monster' && r.ofClass('Ghost').length > 0 }
    ],
    hints: [
      'The abstract method ends with a semicolon instead of a body: <code>public abstract String speak();</code>',
      'Ghost needs a constructor that calls <code>super(...)</code> and a <code>speak()</code> method.'
    ],
    starter: {
      'Main.java': main(`        Monster[] monsters = { new Zombie("Bob", -2, 0), new Skeleton("Bones", 2, 0) };
        for (Monster m : monsters) {
            World.add(m);
        }`),
      'Monster.java': MONSTER_BASE,
      'Zombie.java': ZOMBIE_BASE.replace('    }\n}\n', '    }\n\n    @Override\n    public String speak() {\n        return "Braaains...";\n    }\n}\n'),
      'Skeleton.java': SKELETON_BASE.replace('    }\n}\n', '    }\n\n    @Override\n    public String speak() {\n        return "*rattle*";\n    }\n}\n')
    },
    solution: {
      'Main.java': main(`        Monster[] monsters = { new Zombie("Bob", -3, 0), new Skeleton("Bones", 0, 0), new Ghost("Boo", 3, 0) };
        for (Monster m : monsters) {
            World.add(m);
            System.out.println(m.introduce());
        }`),
      'Monster.java': ABSTRACT_MONSTER,
      'Zombie.java': ZOMBIE_BASE.replace('    }\n}\n', '    }\n\n    @Override\n    public String speak() {\n        return "Braaains...";\n    }\n}\n'),
      'Skeleton.java': SKELETON_BASE.replace('    }\n}\n', '    }\n\n    @Override\n    public String speak() {\n        return "*rattle*";\n    }\n}\n'),
      'Ghost.java': `public class Ghost extends Monster {
    public Ghost(String name, double x, double z) {
        super(name, "#e8f0ff", 1.7, x, z);
    }

    @Override
    public String speak() {
        return "Boooo!";
    }
}
`
    }
  },
  // ------------------------------------------------------------ 17
  {
    id: 'interfaces',
    unit: 'Inheritance',
    title: 'Interfaces',
    intro: `
      <p>Bats and ghosts can fly; zombies can't. A class can only extend <b>one</b> parent, but it can <b>implement</b> many <b>interfaces</b>. An interface is a promise: "I have these methods."</p>
      <pre>public interface Flyer {
    double getAltitude();
}

public class Bat extends Monster implements Flyer {
    public double getAltitude() { return 4.0; }
}</pre>
      <p>The world lifts anything with a <code>getAltitude()</code> method off the ground. Use <code>instanceof</code> to ask whether an object is a Flyer.</p>`,
    concepts: [
      { code: 'interface Flyer { }', text: 'a promise of methods' },
      { code: 'implements Flyer', text: 'keep the promise' },
      { code: 'm instanceof Flyer', text: 'can this one fly?' }
    ],
    steps: [
      { text: 'Write an interface <code>Flyer</code> with <code>double getAltitude();</code>', check: (r) => r.cls('Flyer')?.isInterface && !!r.method('Flyer', 'getAltitude', 0) },
      { text: 'Write a <code>Bat</code> that extends Monster and implements Flyer', check: (r) => { const c = r.cls('Bat'); return !!c && c.superName === 'Monster' && c.interfaces.includes('Flyer'); } },
      { text: 'Make <code>Ghost</code> a Flyer too, and get at least two monsters floating in the world', check: (r) => r.cls('Ghost')?.allInterfaces.includes('Flyer') && r.entities.filter((e) => e.props.y > 0).length >= 2 },
      { text: 'Loop over your monsters and print <code>NAME can fly</code> only for Flyers, using <code>instanceof</code>', check: (r) => r.has('instanceof') && r.out.filter((l) => / can fly$/.test(l)).length >= 2 }
    ],
    hints: [
      'Interface methods are public automatically, but the class must write <code>public double getAltitude()</code>.',
      '<code>if (m instanceof Flyer) { System.out.println(m.name + " can fly"); }</code>'
    ],
    starter: {
      'Main.java': START,
      'Monster.java': ABSTRACT_MONSTER,
      'Zombie.java': ZOMBIE_BASE.replace('    }\n}\n', '    }\n\n    @Override\n    public String speak() {\n        return "Braaains...";\n    }\n}\n'),
      'Ghost.java': `public class Ghost extends Monster {
    public Ghost(String name, double x, double z) {
        super(name, "#e8f0ff", 1.7, x, z);
    }

    @Override
    public String speak() {
        return "Boooo!";
    }
}
`
    },
    solution: {
      'Main.java': main(`        Monster[] monsters = { new Zombie("Bob", -3, 0), new Bat("Flappy", 0, 0), new Ghost("Boo", 3, 0) };
        for (Monster m : monsters) {
            World.add(m);
            if (m instanceof Flyer) {
                System.out.println(m.name + " can fly");
            }
        }`),
      'Monster.java': ABSTRACT_MONSTER,
      'Zombie.java': ZOMBIE_BASE.replace('    }\n}\n', '    }\n\n    @Override\n    public String speak() {\n        return "Braaains...";\n    }\n}\n'),
      'Flyer.java': `public interface Flyer {
    double getAltitude();
}
`,
      'Bat.java': `public class Bat extends Monster implements Flyer {
    public Bat(String name, double x, double z) {
        super(name, "#5b4a7a", 0.6, x, z);
    }

    @Override
    public String speak() {
        return "Squeak!";
    }

    public double getAltitude() {
        return 4.0;
    }
}
`,
      'Ghost.java': `public class Ghost extends Monster implements Flyer {
    public Ghost(String name, double x, double z) {
        super(name, "#e8f0ff", 1.7, x, z);
    }

    @Override
    public String speak() {
        return "Boooo!";
    }

    public double getAltitude() {
        return 1.5;
    }
}
`
    }
  },
  // ------------------------------------------------------------ composition
  {
    id: 'weapons',
    unit: 'Inheritance',
    title: 'Has-a: weapons',
    intro: `
      <p>Inheritance says a Zombie <b>is a</b> Monster. <b>Composition</b> says a Monster <b>has a</b> Weapon: one object stored in another object's field.</p>
      <pre>Sword sword = new Sword("Slicer", "#c9d3e0", 4);
Zombie bob = new Zombie("Bob", 0, 0, sword);</pre>
      <p>The monster's constructor takes the weapon as a parameter and keeps it in a field:</p>
      <pre>protected Weapon weapon;

public Monster(..., Weapon weapon) {
    this.weapon = weapon;
}</pre>
      <p>The world draws whatever is in a field named <code>weapon</code> in the creature's hand. Classes named <code>Sword</code>, <code>Axe</code>, <code>Hammer</code>, <code>Bow</code>, <code>Wand</code>, <code>Staff</code>, <code>Spear</code> or <code>Shield</code> each get their own look, and the weapon's <code>color</code> and <code>length</code> fields change it. Give monsters a <code>health</code> field and the world shows a health bar.</p>`,
    concepts: [
      { code: 'protected Weapon weapon;', text: 'a Monster has a Weapon' },
      { code: 'new Zombie(..., sword)', text: 'pass an object in' },
      { code: 'weapon.getDamage()', text: 'use the object inside' },
      { code: 'target.health -= 3;', text: 'change another object' }
    ],
    steps: [
      { text: 'Write an abstract class <code>Weapon</code> with <code>name</code>, <code>color</code> and <code>int damage</code> fields, a constructor, and <code>getDamage()</code>', check: (r) => { const c = r.cls('Weapon'); return !!c && c.isAbstract && !!r.field('Weapon', 'damage') && !!r.method('Weapon', 'getDamage', 0); } },
      { text: 'Write <code>Sword</code> and <code>Axe</code> classes that extend Weapon with different damage', check: (r) => r.cls('Sword')?.superName === 'Weapon' && r.cls('Axe')?.superName === 'Weapon' },
      { text: 'Add a <code>Weapon weapon</code> field to Monster, set from a constructor parameter. Put a zombie with a sword and a skeleton with an axe in the world', check: (r) => {
        const takes = r.cls('Monster')?.ctors.some((k) => k.params.includes('Weapon'));
        if (!takes) return false;
        const kinds = new Set(r.entities.map((e) => e.props.weapon && e.props.weapon.kind));
        return kinds.has('sword') && kinds.has('axe') ? true : 'Give one monster a Sword and another an Axe.';
      } },
      { text: 'Give Monster an <code>int health</code> and an <code>attack(Monster target)</code> method that takes away the weapon’s damage. Make them fight with a loop and <code>World.pause</code>', check: (r) => !!r.method('Monster', 'attack', 1) && r.entities.some((e) => { const hs = e.keys.map((k) => k.props.health).filter((h) => typeof h === 'number'); return hs.length >= 2 && hs[hs.length - 1] < hs[0]; }) }
    ],
    hints: [
      'Sword.java: <code>public class Sword extends Weapon { public Sword(String name, String color, int damage) { super(name, color, damage); } }</code>',
      'Inside Monster: <code>public void attack(Monster target) { target.health = target.health - weapon.getDamage(); }</code>. Because both are Monsters, attack can change the other one’s protected field.'
    ],
    starter: {
      'Main.java': START,
      'Monster.java': ABSTRACT_MONSTER,
      'Zombie.java': ZOMBIE_BASE.replace('    }\n}\n', '    }\n\n    @Override\n    public String speak() {\n        return "Braaains...";\n    }\n}\n'),
      'Skeleton.java': SKELETON_BASE.replace('    }\n}\n', '    }\n\n    @Override\n    public String speak() {\n        return "*rattle*";\n    }\n}\n'),
      'Weapon.java': '// Write the abstract Weapon class here\n',
      'Sword.java': '// Sword extends Weapon\n',
      'Axe.java': '// Axe extends Weapon\n'
    },
    solution: {
      'Main.java': main(`        Zombie bob = new Zombie("Bob", -1.5, 0, new Sword("Slicer", "#c9d3e0", 3));
        Skeleton bones = new Skeleton("Bones", 1.5, 0, new Axe("Chopper", "#aab4c3", 4));
        World.add(bob);
        World.add(bones);
        for (int round = 0; round < 4; round++) {
            bob.attack(bones);
            World.pause(0.8);
            bones.attack(bob);
            World.pause(0.8);
        }
        System.out.println(bob.name + " has " + bob.health + " health left");`),
      'Weapon.java': `public abstract class Weapon {
    protected String name;
    protected String color;
    protected int damage;

    public Weapon(String name, String color, int damage) {
        this.name = name;
        this.color = color;
        this.damage = damage;
    }

    public int getDamage() {
        return damage;
    }
}
`,
      'Sword.java': `public class Sword extends Weapon {
    public Sword(String name, String color, int damage) {
        super(name, color, damage);
    }
}
`,
      'Axe.java': `public class Axe extends Weapon {
    public Axe(String name, String color, int damage) {
        super(name, color, damage);
    }
}
`,
      'Monster.java': `public abstract class Monster {
    protected String name;
    protected String color;
    protected double height;
    protected double x;
    protected double z;
    protected int health = 20;
    protected Weapon weapon;

    public Monster(String name, String color, double height, double x, double z, Weapon weapon) {
        this.name = name;
        this.color = color;
        this.height = height;
        this.x = x;
        this.z = z;
        this.weapon = weapon;
    }

    public abstract String speak();

    public void attack(Monster target) {
        target.health = target.health - weapon.getDamage();
    }
}
`,
      'Zombie.java': `public class Zombie extends Monster {
    public Zombie(String name, double x, double z, Weapon weapon) {
        super(name, "#6abf4b", 1.8, x, z, weapon);
    }

    @Override
    public String speak() {
        return "Braaains...";
    }
}
`,
      'Skeleton.java': `public class Skeleton extends Monster {
    public Skeleton(String name, double x, double z, Weapon weapon) {
        super(name, "#f2efe6", 1.9, x, z, weapon);
    }

    @Override
    public String speak() {
        return "*rattle*";
    }
}
`
    }
  },
  // ------------------------------------------------------------ 18
  {
    id: 'arraylist',
    unit: 'Inheritance',
    title: 'ArrayList',
    intro: `
      <p>Arrays have a fixed size. An <code>ArrayList</code> grows and shrinks as you add and remove items. It lives in <code>java.util</code>, so import it at the top of the file:</p>
      <pre>import java.util.ArrayList;

ArrayList&lt;Monster&gt; horde = new ArrayList&lt;&gt;();
horde.add(new Zombie("Bob", 0, 0));
horde.get(0);      // first item
horde.size();      // how many
horde.remove(0);   // take one out</pre>
      <p>The type in <code>&lt; &gt;</code> says what the list holds. <code>Math.cos</code> and <code>Math.sin</code> help place things in a circle.</p>`,
    concepts: [
      { code: 'new ArrayList<>()', text: 'an empty list' },
      { code: 'list.add(x)', text: 'add to the end' },
      { code: 'list.size()', text: 'how many' },
      { code: 'for (Monster m : list)', text: 'go through all' }
    ],
    steps: [
      { text: 'Make an <code>ArrayList&lt;Monster&gt;</code> and add 12 monsters to it in a loop', check: (r) => r.has('var:ArrayList<Monster>') || r.has('var:List<Monster>') },
      { text: 'Place them in a circle using <code>Math.cos</code> and <code>Math.sin</code>', check: (r) => r.has('call:cos') && r.has('call:sin') && r.entities.length >= 10 },
      { text: 'Remove one monster with <code>remove</code>, then print <code>Horde size: 11</code> with <code>size()</code>', check: (r) => { const m = r.lineMatch(/^Horde size: (\d+)$/); return r.has('call:remove') && !!m && Number(m[1]) === r.entities.length ? true : m ? `There are ${r.entities.length} monsters in the world.` : false; } }
    ],
    hints: [
      'Angle for monster i: <code>double angle = i * 2 * Math.PI / 12;</code> then <code>x = 6 * Math.cos(angle)</code>',
      'Add to the world after removing: <code>for (Monster m : horde) { World.add(m); }</code>'
    ],
    starter: {
      'Main.java': START,
      'Monster.java': ABSTRACT_MONSTER,
      'Zombie.java': ZOMBIE_BASE.replace('    }\n}\n', '    }\n\n    @Override\n    public String speak() {\n        return "Braaains...";\n    }\n}\n'),
      'Skeleton.java': SKELETON_BASE.replace('    }\n}\n', '    }\n\n    @Override\n    public String speak() {\n        return "*rattle*";\n    }\n}\n')
    },
    solution: {
      'Main.java': main(`        ArrayList<Monster> horde = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            double angle = i * 2 * Math.PI / 12;
            double x = 6 * Math.cos(angle);
            double z = 6 * Math.sin(angle);
            if (i % 2 == 0) {
                horde.add(new Zombie("Z" + i, x, z));
            } else {
                horde.add(new Skeleton("S" + i, x, z));
            }
        }
        horde.remove(0);
        System.out.println("Horde size: " + horde.size());
        for (Monster m : horde) {
            World.add(m);
        }`, 'import java.util.ArrayList;\n\n'),
      'Monster.java': ABSTRACT_MONSTER,
      'Zombie.java': ZOMBIE_BASE.replace('    }\n}\n', '    }\n\n    @Override\n    public String speak() {\n        return "Braaains...";\n    }\n}\n'),
      'Skeleton.java': SKELETON_BASE.replace('    }\n}\n', '    }\n\n    @Override\n    public String speak() {\n        return "*rattle*";\n    }\n}\n')
    }
  },
  // ------------------------------------------------------------ 19
  {
    id: 'capstone',
    unit: 'Project',
    title: 'Final project: Monster Zoo',
    intro: `
      <p>Time to put it all together and build your own monster zoo from scratch. You decide what's in it. The world draws <code>Zombie</code>, <code>Skeleton</code>, <code>Slime</code>, <code>Ghost</code>, <code>Bat</code> and <code>Robot</code> classes as those creatures, and any other class as a friendly blob.</p>
      <p>Fields the world understands: <code>name</code>, <code>color</code>, <code>height</code>, <code>size</code>, <code>x</code>, <code>z</code>, <code>health</code> and <code>maxHealth</code> (shows a health bar), <code>angry</code> (red eyes), <code>eyeColor</code>, <code>hat</code> (a hat color), and <code>weapon</code> / <code>shield</code> (objects drawn in their hands). Methods it calls: <code>getAltitude()</code> to fly, and <code>speak()</code> when clicked.</p>`,
    concepts: [
      { code: 'abstract class', text: 'shared base' },
      { code: 'interface', text: 'extra abilities' },
      { code: 'ArrayList', text: 'hold them all' },
      { code: 'World.pause', text: 'animate' }
    ],
    steps: [
      { text: 'Write at least 4 classes of your own (Main counts)', check: (r) => r.classes.length >= 4 },
      { text: 'Use an abstract class or an interface', check: (r) => r.has('abstract-class') || r.has('interface') },
      { text: 'Have at least two classes that extend the same parent', check: (r) => { const counts = {}; for (const n of r.classes) { const c = r.cls(n); if (c.superName && c.superName !== 'Object') counts[c.superName] = (counts[c.superName] || 0) + 1; } return Object.values(counts).some((v) => v >= 2); } },
      { text: 'Keep your monsters in an <code>ArrayList</code> and put at least 6 in the world', check: (r) => r.has('arraylist') && r.entities.length >= 6 },
      { text: 'Animate something with <code>World.pause</code>', check: (r) => r.has('call:World.pause') && r.tl.duration > 0 }
    ],
    hints: [
      'Ideas: a Robot with a health field that drops each second; Bats circling overhead; a Slime that grows.',
      'Start small, run often, and add one class at a time.'
    ],
    starter: { 'Main.java': main('        // Your monster zoo starts here\n', 'import java.util.ArrayList;\n\n') },
    solution: {
      'Main.java': main(`        ArrayList<Creature> zoo = new ArrayList<>();
        zoo.add(new Robot("Bolt", -4, 0));
        zoo.add(new Robot("Nut", -2, 2));
        zoo.add(new Bat("Flap", 0, -2));
        zoo.add(new Bat("Flop", 2, -2));
        zoo.add(new Robot("Gear", 4, 0));
        zoo.add(new Bat("Flip", 0, 3));
        for (Creature c : zoo) {
            World.add(c);
        }
        for (int t = 0; t < 4; t++) {
            for (Creature c : zoo) {
                c.act();
            }
            World.pause(0.8);
        }`, 'import java.util.ArrayList;\n\n'),
      'Creature.java': `public abstract class Creature {
    protected String name;
    protected double x;
    protected double z;
    protected int health = 10;
    protected int maxHealth = 10;

    public Creature(String name, double x, double z) {
        this.name = name;
        this.x = x;
        this.z = z;
    }

    public abstract void act();

    public String speak() {
        return "I am " + name;
    }
}
`,
      'Flyer.java': `public interface Flyer {
    double getAltitude();
}
`,
      'Robot.java': `public class Robot extends Creature {
    private String color = "#9aa7b8";

    public Robot(String name, double x, double z) {
        super(name, x, z);
    }

    public void act() {
        health = health - 2;
        z = z + 0.5;
    }
}
`,
      'Bat.java': `public class Bat extends Creature implements Flyer {
    private double altitude = 2;

    public Bat(String name, double x, double z) {
        super(name, x, z);
    }

    public void act() {
        altitude = altitude + 0.5;
    }

    public double getAltitude() {
        return altitude;
    }
}
`
    }
  },
  // ------------------------------------------------------------ free play
  {
    id: 'playground',
    unit: 'Free play',
    title: 'Playground',
    free: true,
    intro: `
      <p>No tasks, no checks: an empty island for experiments, tutoring sessions, or showing off.</p>
      <p>Useful world commands: <code>World.add(obj)</code>, <code>World.remove(obj)</code>, <code>World.say(text)</code>, <code>World.say(obj, text)</code>, <code>World.pause(seconds)</code>, <code>World.setSky(color)</code>, <code>World.setGround(color)</code>, <code>World.block(x, z, color)</code>, <code>World.block(x, y, z, color)</code>, <code>World.tree(x, z)</code>, <code>World.flower(x, z, color)</code>.</p>`,
    concepts: [],
    steps: [],
    hints: [],
    starter: { 'Main.java': START },
    solution: null
  }
];

export function lessonById(id) {
  return LESSONS.find((l) => l.id === id) || null;
}
