largestring = str(2**1000)
largesum = 0

for number in range (len(largestring)):

    largesum += int(largestring[number])

print(largesum)