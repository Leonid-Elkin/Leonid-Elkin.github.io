<<<<<<< HEAD
def factorial(number):
    factorial = 1

    for multiplier in range (1,number+1):

        factorial *= multiplier

    return factorial

sum = 0
for item in list(str(factorial(100))):
    sum += int(item)

=======
def factorial(number):
    factorial = 1

    for multiplier in range (1,number+1):

        factorial *= multiplier

    return factorial

sum = 0
for item in list(str(factorial(100))):
    sum += int(item)

>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
print(sum)