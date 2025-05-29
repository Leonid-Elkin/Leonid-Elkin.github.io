<<<<<<< HEAD
number = open("C:\\Users\\walru\\OneDrive\\Рабочий стол\\Python\\Project Euler\\8\\Number.txt","r").read()
largestSum = 0

for startindex in range (len(number) - 13):
    sum = 1
    for adder in range (13):
        sum *= int(number[startindex + adder])
    if sum > largestSum:
        largestSum = sum
    
print(largestSum)
=======
number = open("C:\\Users\\walru\\OneDrive\\Рабочий стол\\Python\\Project Euler\\8\\Number.txt","r").read()
largestSum = 0

for startindex in range (len(number) - 13):
    sum = 1
    for adder in range (13):
        sum *= int(number[startindex + adder])
    if sum > largestSum:
        largestSum = sum
    
print(largestSum)
>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
    