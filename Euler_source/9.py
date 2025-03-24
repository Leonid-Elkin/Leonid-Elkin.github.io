from math import sqrt

for a in range (1,1000):
    for b in range (1,1000):
        constant = a ** 2 + b ** 2
        if float(int(sqrt(constant))) == sqrt(constant):
            if a + b + int(sqrt(constant)) == 1000:
                print(int(a * b * sqrt(constant)))
                quit()