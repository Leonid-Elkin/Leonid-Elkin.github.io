teens = {
    10:3,
    11:6,
    12:6,
    13:8,
    14:8,
    15:7,
    16:7,
    17:9,
    18:8,
    19:8
}

ones = {
    0:0,
    1:3,
    2:3,
    3:5,
    4:4,
    5:4,
    6:3,
    7:5,
    8:5,
    9:4
}

tens = {
    0:0,
    2:6,
    3:6,
    4:5,
    5:5,
    6:5,
    7:7,
    8:6,
    9:6
}

def twonums(number):
    numstr = str(number)
    numsum = 0

    if number > 9:

        if numstr[-1] == numstr[-2] == 0:

            return -3
    
        elif int(numstr[-2]) == 1 or number == 10:

            numsum += teens[int(numstr[-2]) * 10 + int(numstr[-1])]

        else:

            numsum = tens[int(numstr[-2])]
            numsum += ones[int(numstr[-1])]

    else:

        numsum += ones[int(numstr[-1])]

    if numsum == 0:

        numsum = -3

    return numsum

def largenum(number):
    numsum = 0
    numstring = str(number)

    if number == 1000:

        return 11
    
    elif number < 1000 and number > 99:

        numsum += ones[int(numstring[0])]
        numsum += 10
        numsum += twonums(number)

    else:

        numsum += twonums(number) 

    return numsum

numsum = 0

for number in range (1,1_001):

    numsum += largenum(number)

print(numsum)