<<<<<<< HEAD
num1 = 1
num2 = 2
numsum = 0

while num1 < 4_000_000:
    if num1 % 2 == 0:
        numsum += num1
    num2 += num1
    num1 = num2 - num1

=======
num1 = 1
num2 = 2
numsum = 0

while num1 < 4_000_000:
    if num1 % 2 == 0:
        numsum += num1
    num2 += num1
    num1 = num2 - num1

>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
print(numsum)