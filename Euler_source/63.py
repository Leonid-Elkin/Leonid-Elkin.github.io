count = 0
for number in range (1,2_00):
    for power in range (1,2_00):
        numstr = str(number ** power)
        if len(numstr) == power:
            count += 1
print(count)