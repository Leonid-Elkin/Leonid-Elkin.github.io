sum = 1
multiplier = 0
index = 1
for i in range (500):
    multiplier += 2
    index += 2
    sum += index**2
    sum += index**2-multiplier
    sum += index**2-multiplier-multiplier
    sum += index**2-multiplier-multiplier-multiplier
print(sum)