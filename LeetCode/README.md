# LeetCode

Drop a solution in here and it appears on the site. Nothing else to do — a
push that touches this folder runs `.github/workflows/solutions.yml`, which
rebuilds `data/leetcode-solutions.js` and commits it back.

## Naming

Name the file after the problem number. The extension picks the language.

```
1.py                 problem 1, in Python
1.cpp                problem 1 again, in C++  -> the page shows both as tabs
104.java             problem 104, in Java
```

Use a folder when the solution reads an input file:

```
1440/1440.py
1440/data.txt        offered as a download beside the code
```

The title, the difficulty and the link out to leetcode.com are filled in from
the problem number, so `1.py` is all it takes to get "1. Two Sum · Easy".

## Languages it knows

Python, JavaScript, TypeScript, C++, C, Java, C#, Go, Rust, Ruby, Kotlin,
Swift, SQL, Shell. Python and JavaScript get a **run** button on the page —
they execute in the reader's browser. The rest are shown and coloured but not
run, because a browser has no compiler for them.

Anything whose name does not start with a number is ignored; the build prints
what it skipped.

## Adding a language the list does not cover

`LANGS` at the top of `tools/build_solutions.py`, one line.
