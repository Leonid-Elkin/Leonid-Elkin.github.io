def checkCollatz(number):
    count = 1

    while number != 1:
        count += 1
        if number % 2 == 0:
            number = number // 2
        else:
            number = number * 3 + 1
    
    return count

largestLength = 0
largestNumber = 0

for number in range (1,1_000_000):
    length = checkCollatz(number)

    if length > largestLength:
        largestLength = length
        largestNumber = number

print(largestNumber,largestLength)