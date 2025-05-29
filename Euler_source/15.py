<<<<<<< HEAD
def factorial(number):
    factorial = 1

    for multiplier in range (1,number+1):

        factorial *= multiplier

    return factorial

n = 40
r = 20

answer = (factorial(n)/(factorial(n-r)*factorial(r)))

=======
def factorial(number):
    factorial = 1

    for multiplier in range (1,number+1):

        factorial *= multiplier

    return factorial

n = 40
r = 20

answer = (factorial(n)/(factorial(n-r)*factorial(r)))

>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
print(int(answer))