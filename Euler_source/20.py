def factorial(number):
    factorial = 1

    for multiplier in range (1,number+1):

        factorial *= multiplier

    return factorial

sum = 0
for item in list(str(factorial(100))):
    sum += int(item)

print(sum)