<<<<<<< HEAD
count = 0
for number in range (1,2_00):
    for power in range (1,2_00):
        numstr = str(number ** power)
        if len(numstr) == power:
            count += 1
=======
count = 0
for number in range (1,2_00):
    for power in range (1,2_00):
        numstr = str(number ** power)
        if len(numstr) == power:
            count += 1
>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
print(count)