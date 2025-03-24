import math

def factorial(number):

    product = 1
    for multiplier in range (1,number+1):

        product *= multiplier
    
    return product

counter = 0

for n in range (1,101):

    for r in range (1,n):

        number = factorial(n) / ((factorial(r) * factorial(n - r)))
        print(number)
        if number  > 1_000_000:
            print("passed")
            counter += 1

print(counter)
