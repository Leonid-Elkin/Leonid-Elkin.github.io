
def isleap (year):

    if year % 100 == 0:

        if year % 400 == 0:

            return True
    
    else:

        if year % 4 == 0:

            return True
    
    return False

monthlength = {
    0:31,
    1:28,
    2:31,
    3:30,
    4:31,
    5:30,
    6:31,
    7:31,
    8:30,
    9:31,
    10:30,
    11:31
}

day = 1
firstsum = 0
for year in range (1901,2001):

    for month in range (12):

        for monthday in range (monthlength[month]):
            day += 1
            if day > 6:
                if monthday == 0:
                    firstsum += 1
                day = 0
print(firstsum)
