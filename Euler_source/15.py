def factorial(number):
    factorial = 1

    for multiplier in range (1,number+1):

        factorial *= multiplier

    return factorial

n = 40
r = 20

answer = (factorial(n)/(factorial(n-r)*factorial(r)))

print(int(answer))