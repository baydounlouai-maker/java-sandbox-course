// The final exam: one hour, 100 points, five sections.
// Code in `code` fields is shown to the student. When `run` is set, the tests compile and run it
// ('main' wraps it in a main method, 'file' means it is a whole Main.java) and check that it
// prints exactly the correct option, so every "what does this print" answer is proven by the engine.

export const EXAM_MINUTES = 60;
export const PASS_PERCENT = 60;

export const SECTIONS = [
  { id: 'mcq', title: 'Multiple choice', short: 'Choice', blurb: 'Pick the one correct answer.' },
  { id: 'tf', title: 'True or false', short: 'T / F', blurb: 'Decide if each statement is true.' },
  { id: 'fill', title: 'Fill in the blanks', short: 'Blanks', blurb: 'Type the missing code so the program works.' },
  { id: 'fix', title: 'Find and fix', short: 'Fix', blurb: 'Each program has mistakes that stop it from compiling. Fix them without rewriting the program. You can’t run these, so read carefully.' },
  { id: 'write', title: 'Write the code', short: 'Write', blurb: 'Write a method from scratch. You can run your code to try it out.' }
];

const MAIN = (body) => `public class Main {
    public static void main(String[] args) {
${body.split('\n').map((l) => '        ' + l).join('\n')}
    }
}`;

export const QUESTIONS = [
  // ------------------------------------------------------------------ multiple choice
  {
    id: 'mc-division', section: 'mcq', points: 2, topic: 'Variables',
    prompt: 'What does this print?',
    code: `int a = 7;
int b = 2;
double c = a / b;
System.out.println(c);`,
    run: 'main',
    options: ['3.5', '3.0', '3', '4.0'],
    answer: 1,
    explain: '<code>a / b</code> divides two ints, so Java does integer division first and gets <code>3</code>. Only then is it stored in a double, which makes it <code>3.0</code>.'
  },
  {
    id: 'mc-concat', section: 'mcq', points: 2, topic: 'Strings',
    prompt: 'What does this print?',
    code: `System.out.println(1 + 2 + "3" + 4 + 5);`,
    run: 'main',
    options: ['3345', '12345', '15', '339'],
    answer: 0,
    explain: 'Java works left to right. <code>1 + 2</code> is the number <code>3</code>. Adding <code>"3"</code> makes the String <code>"33"</code>, and from then on every <code>+</code> glues text: <code>"334"</code>, then <code>"3345"</code>.'
  },
  {
    id: 'mc-loop-count', section: 'mcq', points: 2, topic: 'Loops',
    prompt: 'What does this print?',
    code: `int count = 0;
for (int i = 10; i > 0; i -= 3) {
    count++;
}
System.out.println(count);`,
    run: 'main',
    options: ['3', '4', '10', 'Nothing, the loop never ends'],
    answer: 1,
    explain: '<code>i</code> takes the values 10, 7, 4 and 1. Next it would be -2, which fails <code>i &gt; 0</code>. That is 4 trips round the loop.'
  },
  {
    id: 'mc-conditions', section: 'mcq', points: 2, topic: 'Conditions',
    prompt: 'What does this print?',
    code: `int hp = 40;
boolean angry = true;
if (hp < 50 && !angry) {
    System.out.println("Run");
} else if (hp < 50 || angry) {
    System.out.println("Fight");
} else {
    System.out.println("Rest");
}`,
    run: 'main',
    options: ['Run', 'Fight', 'Rest', '`Run` and then `Fight`'],
    answer: 1,
    explain: '<code>!angry</code> is false, so the first condition is false. <code>hp &lt; 50 || angry</code> is true, so <code>Fight</code> is printed. Only one branch of an if / else if / else chain ever runs.'
  },
  {
    id: 'mc-array-bounds', section: 'mcq', points: 2, topic: 'Arrays',
    prompt: 'What happens when this runs?',
    code: `int[] nums = new int[5];
nums[5] = 1;`,
    options: [
      'The last element of the array becomes 1',
      'It compiles, but throws an ArrayIndexOutOfBoundsException when it runs',
      'It does not compile',
      'The array grows to 6 elements'
    ],
    answer: 1,
    explain: 'An array of 5 has the indexes 0 to 4. Java can’t tell at compile time that 5 is too big, so it fails when the line runs.'
  },
  {
    id: 'mc-string-equals', section: 'mcq', points: 2, topic: 'Strings',
    prompt: 'What is the right way to check if the String <code>name</code> holds the text <code>Zed</code>?',
    options: ['`name == "Zed"`', '`name.equals("Zed")`', '`name = "Zed"`', '`name.equals(Zed)`'],
    answer: 1,
    explain: '<code>equals</code> compares the letters. <code>==</code> checks if two variables point at the very same object, which can be false even when the text matches. <code>=</code> assigns, and <code>Zed</code> without quotes would be a variable name.'
  },
  {
    id: 'mc-method-header', section: 'mcq', points: 2, topic: 'Methods',
    prompt: 'Which header declares a method that takes two ints and returns their average as a double?',
    options: [
      '`static double average(int a, int b)`',
      '`static average(int a, int b): double`',
      '`static void average(int a, b)`',
      '`static double average(a, b)`'
    ],
    answer: 0,
    explain: 'The return type comes before the name, and every parameter needs its own type. <code>void</code> would mean the method returns nothing.'
  },
  {
    id: 'mc-constructor', section: 'mcq', points: 2, topic: 'Constructors',
    prompt: 'Given this class, which line compiles?',
    code: `class Zombie {
    String name;

    Zombie(String name) {
        this.name = name;
    }
}`,
    options: [
      '`Zombie z = new Zombie();`',
      '`Zombie z = new Zombie("Zed");`',
      '`Zombie z = Zombie("Zed");`',
      '`Zombie z = new Zombie(String "Zed");`'
    ],
    answer: 1,
    explain: 'Once you write a constructor yourself, Java no longer adds the empty one, so <code>new Zombie()</code> fails. You always need <code>new</code>, and you pass values, not types.'
  },
  {
    id: 'mc-static', section: 'mcq', points: 2, topic: 'Static',
    prompt: 'What does this print?',
    code: `class Slime {
    static int count = 0;
    int size;

    Slime(int size) {
        this.size = size;
        count++;
    }
}

// in main:
Slime a = new Slime(1);
Slime b = new Slime(2);
Slime c = new Slime(3);
System.out.println(Slime.count + " " + a.size);`,
    run: 'file',
    file: `class Slime {
    static int count = 0;
    int size;

    Slime(int size) {
        this.size = size;
        count++;
    }
}

public class Main {
    public static void main(String[] args) {
        Slime a = new Slime(1);
        Slime b = new Slime(2);
        Slime c = new Slime(3);
        System.out.println(Slime.count + " " + a.size);
    }
}`,
    options: ['1 1', '3 1', '3 3', '1 3'],
    answer: 1,
    explain: 'A <code>static</code> field belongs to the class, so all three slimes share one <code>count</code>, which ends at 3. <code>size</code> is not static, so each slime has its own, and <code>a</code>’s is 1.'
  },
  {
    id: 'mc-super-order', section: 'mcq', points: 2, topic: 'Inheritance',
    prompt: 'What does <code>new Zombie();</code> print?',
    code: `class Monster {
    Monster() {
        System.out.print("M");
    }
}

class Zombie extends Monster {
    Zombie() {
        System.out.print("Z");
    }
}`,
    run: 'file',
    file: `class Monster {
    Monster() {
        System.out.print("M");
    }
}

class Zombie extends Monster {
    Zombie() {
        System.out.print("Z");
    }
}

public class Main {
    public static void main(String[] args) {
        new Zombie();
    }
}`,
    options: ['Z', 'MZ', 'ZM', 'M'],
    answer: 1,
    explain: 'Every constructor starts by calling the parent’s constructor, even when you don’t write <code>super()</code>. So the Monster part is built first.'
  },
  {
    id: 'mc-polymorphism', section: 'mcq', points: 2, topic: 'Polymorphism',
    prompt: 'What does this print?',
    code: `class Monster {
    String sound() { return "..."; }
}

class Ghost extends Monster {
    String sound() { return "Boo"; }
}

// in main:
Monster m = new Ghost();
System.out.println(m.sound());`,
    run: 'file',
    file: `class Monster {
    String sound() { return "..."; }
}

class Ghost extends Monster {
    String sound() { return "Boo"; }
}

public class Main {
    public static void main(String[] args) {
        Monster m = new Ghost();
        System.out.println(m.sound());
    }
}`,
    options: ['...', 'Boo', 'Nothing, it doesn’t compile because m is a Monster', 'It crashes when it runs'],
    answer: 1,
    explain: 'The variable’s type (Monster) decides which methods you may call. The object’s real class (Ghost) decides which version runs. That is polymorphism.'
  },
  {
    id: 'mc-abstract', section: 'mcq', points: 2, topic: 'Abstract classes',
    prompt: 'Which statement about this class is true?',
    code: `abstract class Shape {
    abstract double area();
}`,
    options: [
      '`new Shape()` makes a Shape whose area is 0',
      'A class that extends Shape must override area(), or be abstract itself',
      'An abstract method must have an empty body `{ }`',
      'Shape is not allowed to have a constructor'
    ],
    answer: 1,
    explain: 'You can’t create an abstract class with <code>new</code>, and an abstract method has no body at all, just a <code>;</code>. A concrete subclass has to fill in every abstract method. Abstract classes may have constructors, which subclasses call with <code>super(...)</code>.'
  },

  // ------------------------------------------------------------------ true / false
  {
    id: 'tf-int-decimal', section: 'tf', points: 1, topic: 'Variables',
    prompt: 'An <code>int</code> variable can hold a decimal number like <code>2.5</code>.',
    answer: false,
    explain: '<code>int</code> holds whole numbers only. Use <code>double</code> for decimals.'
  },
  {
    id: 'tf-while-zero', section: 'tf', points: 1, topic: 'Loops',
    prompt: 'The body of a <code>while</code> loop might run zero times.',
    answer: true,
    explain: 'The condition is checked before the first trip. If it starts false, the body never runs. (A <code>do ... while</code> loop always runs at least once.)'
  },
  {
    id: 'tf-index-one', section: 'tf', points: 1, topic: 'Arrays',
    prompt: 'In Java, the first element of an array is at index 1.',
    answer: false,
    explain: 'Indexes start at 0. The last element is at <code>length - 1</code>.'
  },
  {
    id: 'tf-private', section: 'tf', points: 1, topic: 'Encapsulation',
    prompt: 'A <code>private</code> field can be read directly from another class, as long as you have an object.',
    answer: false,
    explain: '<code>private</code> means only code inside the same class can use it. Other classes go through public methods such as getters.'
  },
  {
    id: 'tf-super-first', section: 'tf', points: 1, topic: 'Inheritance',
    prompt: 'A constructor can call its parent’s constructor with <code>super(...)</code>, and that call must be the first statement.',
    answer: true,
    explain: 'The parent part of the object is built before anything else, so <code>super(...)</code> has to come first.'
  },
  {
    id: 'tf-two-parents', section: 'tf', points: 1, topic: 'Inheritance',
    prompt: 'A class can extend two classes at once, like <code>class Bat extends Monster, Animal</code>.',
    answer: false,
    explain: 'A Java class has exactly one parent class.'
  },
  {
    id: 'tf-overload', section: 'tf', points: 1, topic: 'Methods',
    prompt: 'Two methods in the same class may share a name if their parameter lists are different.',
    answer: true,
    explain: 'That is overloading, like <code>attack()</code> and <code>attack(int damage)</code>. Java picks one by looking at the arguments.'
  },
  {
    id: 'tf-has-a', section: 'tf', points: 1, topic: 'Composition',
    prompt: 'If <code>Monster</code> has a field <code>Weapon weapon;</code>, then Monster inherits from Weapon.',
    answer: false,
    explain: 'That is composition: a Monster <em>has a</em> Weapon. Inheritance would be <code>class Monster extends Weapon</code>, meaning a Monster <em>is a</em> Weapon.'
  },

  // ------------------------------------------------------------------ fill in the blanks
  // In templates, [[0]], [[1]] ... mark the blanks. `expect` is what the finished program prints.
  {
    id: 'fill-count', section: 'fill', points: 3, topic: 'Loops',
    prompt: 'Complete the loop so it prints <code>1 2 3 4 5 </code> on one line.',
    template: MAIN(`for (int i = [[0]]; [[1]]; i++) {
    System.out.print(i + " ");
}`),
    blanks: [
      { answers: ['1'] },
      { answers: ['i <= 5', 'i < 6', '5 >= i', '6 > i'] }
    ],
    expect: '1 2 3 4 5',
    explain: 'Start at 1 and keep going while <code>i &lt;= 5</code> (or <code>i &lt; 6</code>).'
  },
  {
    id: 'fill-method', section: 'fill', points: 3, topic: 'Methods',
    prompt: 'Complete the method so the program prints <code>16</code>.',
    template: `public class Main {
    public static [[0]] square(int n) {
        [[1]] n * n;
    }

    public static void main(String[] args) {
        System.out.println(square(4));
    }
}`,
    blanks: [
      { answers: ['int', 'long'] },
      { answers: ['return'] }
    ],
    expect: '16',
    explain: 'The method gives back a whole number, so its return type is <code>int</code>, and <code>return</code> hands the value back to the caller.'
  },
  {
    id: 'fill-array-sum', section: 'fill', points: 3, topic: 'Arrays',
    prompt: 'Complete the code so it adds up every coin and prints <code>40</code>.',
    template: MAIN(`int[] coins = {5, 10, 25};
int total = 0;
for (int i = 0; i < coins.[[0]]; i++) {
    total [[1]] coins[i];
}
System.out.println(total);`),
    blanks: [
      { answers: ['length'] },
      { answers: ['+='] }
    ],
    expect: '40',
    explain: 'Arrays have a <code>length</code> field (no brackets). <code>total += coins[i]</code> is short for <code>total = total + coins[i]</code>.'
  },
  {
    id: 'fill-class', section: 'fill', points: 3, topic: 'Classes',
    prompt: 'Complete the class and the code that uses it so the program prints <code>Zed</code>.',
    template: `class Zombie {
    private String name;
    private int height;

    public Zombie(String name, int height) {
        [[0]].name = name;
        this.height = height;
    }

    public [[1]] getName() {
        return name;
    }
}

public class Main {
    public static void main(String[] args) {
        Zombie z = [[2]] Zombie("Zed", 2);
        System.out.println(z.getName());
    }
}`,
    blanks: [
      { answers: ['this'] },
      { answers: ['String'] },
      { answers: ['new'] }
    ],
    expect: 'Zed',
    explain: '<code>this.name</code> is the field, plain <code>name</code> is the parameter. The getter returns a <code>String</code>, and objects are made with <code>new</code>.'
  },
  {
    id: 'fill-inherit', section: 'fill', points: 3, topic: 'Inheritance',
    prompt: 'Make Skeleton a kind of Monster that starts with 50 health. The program should print <code>50</code>.',
    template: `class Monster {
    protected int health;

    public Monster(int health) {
        this.health = health;
    }
}

class Skeleton [[0]] Monster {
    public Skeleton() {
        [[1]](50);
    }
}

public class Main {
    public static void main(String[] args) {
        Skeleton s = new Skeleton();
        System.out.println(s.health);
    }
}`,
    blanks: [
      { answers: ['extends'] },
      { answers: ['super'] }
    ],
    expect: '50',
    explain: '<code>extends</code> makes Skeleton a subclass, and <code>super(50)</code> runs Monster’s constructor with 50.'
  },
  {
    id: 'fill-abstract', section: 'fill', points: 3, topic: 'Abstract classes',
    prompt: 'Complete the code so it prints <code>9.0</code>. Shape should be a class nobody can create directly, and Square should clearly mark that it replaces a parent method.',
    template: `[[0]] class Shape {
    public abstract double area();
}

class Square extends Shape {
    private double side;

    public Square(double side) {
        this.side = side;
    }

    [[1]]
    public double area() {
        return side * side;
    }
}

public class Main {
    public static void main(String[] args) {
        Shape s = new Square(3);
        System.out.println(s.area());
    }
}`,
    blanks: [
      { answers: ['abstract'] },
      { answers: ['@Override'] }
    ],
    expect: '9.0',
    explain: 'A class with an abstract method must itself be <code>abstract</code>. <code>@Override</code> asks Java to check that you really are replacing a parent method.'
  },

  // ------------------------------------------------------------------ find and fix
  {
    id: 'fix-basics', section: 'fix', points: 4, topic: 'Variables', mistakes: 2,
    prompt: 'This program should print <code>Zed has 3 lives</code>.',
    broken: `public class Main {
    public static void main(String[] args) {
        int lives = 3
        String name = "Zed";
        System.out.println(name + " has " + lives + " lives);
    }
}`,
    solution: `public class Main {
    public static void main(String[] args) {
        int lives = 3;
        String name = "Zed";
        System.out.println(name + " has " + lives + " lives");
    }
}`,
    expect: 'Zed has 3 lives',
    explain: 'Line 3 is missing its <code>;</code>, and the text <code>" lives</code> on line 5 is missing its closing quote.'
  },
  {
    id: 'fix-types', section: 'fix', points: 4, topic: 'Types', mistakes: 2,
    prompt: 'This program should print <code>Total: 10</code> and then <code>5</code>.',
    broken: `public class Main {
    public static void main(String[] args) {
        int total = 0;
        for (int i = 1; i <= 4; i++) {
            total += i;
        }
        string message = "Total: " + total;
        int half = total / 2.0;
        System.out.println(message);
        System.out.println(half);
    }
}`,
    solution: `public class Main {
    public static void main(String[] args) {
        int total = 0;
        for (int i = 1; i <= 4; i++) {
            total += i;
        }
        String message = "Total: " + total;
        int half = total / 2;
        System.out.println(message);
        System.out.println(half);
    }
}`,
    expect: 'Total: 10\n5',
    explain: 'Java is case sensitive, so it’s <code>String</code> with a capital S. And <code>total / 2.0</code> is a double, which can’t be stored in an int without a cast. Use <code>total / 2</code>.'
  },
  {
    id: 'fix-methods', section: 'fix', points: 4, topic: 'Methods', mistakes: 2,
    prompt: 'This program should print <code>Answer: 42</code>.',
    broken: `public class Main {
    public static int doubleIt(int n) {
        int result = n * 2;
    }

    public static void main(String[] args) {
        int x = doubleIt("21");
        System.out.println("Answer: " + x);
    }
}`,
    solution: `public class Main {
    public static int doubleIt(int n) {
        int result = n * 2;
        return result;
    }

    public static void main(String[] args) {
        int x = doubleIt(21);
        System.out.println("Answer: " + x);
    }
}`,
    expect: 'Answer: 42',
    explain: 'A method that promises an <code>int</code> must <code>return</code> one. And <code>"21"</code> is a String, but the method wants an int, so pass <code>21</code>.'
  },
  {
    id: 'fix-classes', section: 'fix', points: 4, topic: 'Encapsulation', mistakes: 2,
    prompt: 'This program should print <code>Batty has 2 wings</code>.',
    broken: `class Bat {
    private String name;
    private int wings;

    public Bat(String name) {
        this.name = name;
        wings = 2;
    }

    public String getName() {
        return name;
    }

    public int getWings() {
        return wings;
    }
}

public class Main {
    public static void main(String[] args) {
        Bat b = new Bat();
        System.out.println(b.name + " has " + b.getWings() + " wings");
    }
}`,
    solution: `class Bat {
    private String name;
    private int wings;

    public Bat(String name) {
        this.name = name;
        wings = 2;
    }

    public String getName() {
        return name;
    }

    public int getWings() {
        return wings;
    }
}

public class Main {
    public static void main(String[] args) {
        Bat b = new Bat("Batty");
        System.out.println(b.getName() + " has " + b.getWings() + " wings");
    }
}`,
    expect: 'Batty has 2 wings',
    explain: 'The only constructor needs a name, so it’s <code>new Bat("Batty")</code>. And <code>name</code> is private, so Main has to use <code>getName()</code>.'
  },
  {
    id: 'fix-inheritance', section: 'fix', points: 4, topic: 'Inheritance', mistakes: 2,
    prompt: 'Ghosts start with 30 health. This program should print <code>Ghost with 30 hp</code>.',
    broken: `class Monster {
    protected int health;

    public Monster(int health) {
        this.health = health;
    }

    public String describe() {
        return "Monster with " + health + " hp";
    }
}

class Ghost extend Monster {
    public Ghost() {
        health = 30;
    }

    @Override
    public String describe() {
        return "Ghost with " + health + " hp";
    }
}

public class Main {
    public static void main(String[] args) {
        Monster g = new Ghost();
        System.out.println(g.describe());
    }
}`,
    solution: `class Monster {
    protected int health;

    public Monster(int health) {
        this.health = health;
    }

    public String describe() {
        return "Monster with " + health + " hp";
    }
}

class Ghost extends Monster {
    public Ghost() {
        super(30);
    }

    @Override
    public String describe() {
        return "Ghost with " + health + " hp";
    }
}

public class Main {
    public static void main(String[] args) {
        Monster g = new Ghost();
        System.out.println(g.describe());
    }
}`,
    expect: 'Ghost with 30 hp',
    explain: 'The keyword is <code>extends</code>. And Monster has no empty constructor, so Ghost’s constructor must call <code>super(30)</code> instead of setting the field.'
  },

  // ------------------------------------------------------------------ write the code
  // Each test calls the student's static method directly. `args` use plain JS values;
  // arrays are turned into Java arrays of `argTypes`.
  {
    id: 'write-grade', section: 'write', points: 10, topic: 'Conditions',
    prompt: `<p>Write a method <code>public static String grade(int score)</code> that turns a test score into a letter:</p>
<ul>
<li><code>90</code> to <code>100</code> gives <code>"A"</code></li>
<li><code>80</code> to <code>89</code> gives <code>"B"</code></li>
<li><code>70</code> to <code>79</code> gives <code>"C"</code></li>
<li><code>0</code> to <code>69</code> gives <code>"F"</code></li>
<li>anything below 0 or above 100 gives <code>"Invalid"</code></li>
</ul>`,
    method: { name: 'grade', params: ['int'], ret: 'String' },
    starter: `public class Main {
    // write grade(int score) here


    public static void main(String[] args) {
        // try your method out, for example:
        // System.out.println(grade(85));
    }
}`,
    solution: `public class Main {
    public static String grade(int score) {
        if (score < 0 || score > 100) {
            return "Invalid";
        } else if (score >= 90) {
            return "A";
        } else if (score >= 80) {
            return "B";
        } else if (score >= 70) {
            return "C";
        } else {
            return "F";
        }
    }

    public static void main(String[] args) {
        System.out.println(grade(85));
    }
}`,
    tests: [
      { args: [95], expect: 'A' },
      { args: [90], expect: 'A' },
      { args: [100], expect: 'A' },
      { args: [85], expect: 'B' },
      { args: [80], expect: 'B' },
      { args: [79], expect: 'C' },
      { args: [42], expect: 'F' },
      { args: [0], expect: 'F' },
      { args: [-1], expect: 'Invalid' },
      { args: [101], expect: 'Invalid' }
    ],
    explain: 'Check the invalid range first, then go from the highest grade down. Each <code>else if</code> only runs when the ones above it were false, so <code>score &gt;= 80</code> already means “80 to 89”.'
  },
  {
    id: 'write-vowels', section: 'write', points: 10, topic: 'Loops and Strings',
    prompt: `<p>Write a method <code>public static int countVowels(String word)</code> that returns how many vowels (<code>a e i o u</code>) are in <code>word</code>. Count capital vowels too.</p>
<p>For example <code>countVowels("Banana")</code> is <code>3</code> and <code>countVowels("SKY")</code> is <code>0</code>.</p>`,
    method: { name: 'countVowels', params: ['String'], ret: 'int' },
    starter: `public class Main {
    // write countVowels(String word) here


    public static void main(String[] args) {
        // try your method out, for example:
        // System.out.println(countVowels("Banana"));
    }
}`,
    solution: `public class Main {
    public static int countVowels(String word) {
        int count = 0;
        String lower = word.toLowerCase();
        for (int i = 0; i < lower.length(); i++) {
            char c = lower.charAt(i);
            if (c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u') {
                count++;
            }
        }
        return count;
    }

    public static void main(String[] args) {
        System.out.println(countVowels("Banana"));
    }
}`,
    tests: [
      { args: ['Banana'], expect: 3 },
      { args: ['SKY'], expect: 0 },
      { args: ['Education'], expect: 5 },
      { args: ['AEIOUaeiou'], expect: 10 },
      { args: [''], expect: 0 },
      { args: ['rhythm and blues'], expect: 3 }
    ],
    explain: 'Loop over every index with <code>charAt(i)</code> and count the vowels. Lower-casing the word first means you only have to check five letters.'
  },
  {
    id: 'write-running', section: 'write', points: 10, topic: 'Arrays',
    prompt: `<p>Write a method <code>public static int[] runningTotal(int[] nums)</code> that returns a <b>new</b> array of the same length, where each element is the sum of <code>nums</code> up to and including that position.</p>
<p>For example <code>runningTotal({3, 1, 4, 2})</code> returns <code>{3, 4, 8, 10}</code>. Don’t change the array you were given.</p>`,
    method: { name: 'runningTotal', params: ['int[]'], ret: 'int[]' },
    starter: `import java.util.Arrays;

public class Main {
    // write runningTotal(int[] nums) here


    public static void main(String[] args) {
        // try your method out, for example:
        // int[] result = runningTotal(new int[] {3, 1, 4, 2});
        // System.out.println(Arrays.toString(result));
    }
}`,
    solution: `import java.util.Arrays;

public class Main {
    public static int[] runningTotal(int[] nums) {
        int[] result = new int[nums.length];
        int sum = 0;
        for (int i = 0; i < nums.length; i++) {
            sum += nums[i];
            result[i] = sum;
        }
        return result;
    }

    public static void main(String[] args) {
        int[] result = runningTotal(new int[] {3, 1, 4, 2});
        System.out.println(Arrays.toString(result));
    }
}`,
    tests: [
      { args: [[3, 1, 4, 2]], expect: [3, 4, 8, 10] },
      { args: [[5]], expect: [5] },
      { args: [[]], expect: [] },
      { args: [[2, -2, 2, -2]], expect: [2, 0, 2, 0] },
      { args: [[1, 1, 1, 1, 1]], expect: [1, 2, 3, 4, 5] },
      { args: [[7, 8, 9]], expect: [7, 15, 24], unchanged: true }
    ],
    explain: 'Make <code>new int[nums.length]</code>, keep a running <code>sum</code>, and store it at each index. Writing into <code>nums</code> itself would change the caller’s array.'
  }
];

export const TOTAL_POINTS = QUESTIONS.reduce((s, q) => s + q.points, 0);
export const questionById = (id) => QUESTIONS.find((q) => q.id === id);
