def findReciprocal(denominator):

    remainder_positions = {}
    

    remainder = 1 % denominator
    decimal_part = ''
    position = 0
    

    while remainder != 0:

        if remainder in remainder_positions:
            start = remainder_positions[remainder]
            recurring = decimal_part[start:]
            return recurring
        

        remainder_positions[remainder] = position
        
        remainder *= 10
        decimal_digit = remainder // denominator
        decimal_part += str(decimal_digit)
        remainder = remainder % denominator
        position += 1
    

    return 0

largest = [0,0]

for number in range (1,1001):
    reciprocal = len(str(findReciprocal(number)))
    if reciprocal > largest[0]:
        largest = [reciprocal,number]

print(largest)
    


