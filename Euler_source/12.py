<<<<<<< HEAD
import math
triangle=1
number=0
factors=0
while factors<500:
    number+=triangle
    triangle+=1
    factors=0

    if (math.floor(math.sqrt(number)))**2==number:
        factors+=1

    for factor in range (1,math.floor(math.sqrt(number))):

        if number%factor==0:
            factors+=2

=======
import math
triangle=1
number=0
factors=0
while factors<500:
    number+=triangle
    triangle+=1
    factors=0

    if (math.floor(math.sqrt(number)))**2==number:
        factors+=1

    for factor in range (1,math.floor(math.sqrt(number))):

        if number%factor==0:
            factors+=2

>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
print(number)