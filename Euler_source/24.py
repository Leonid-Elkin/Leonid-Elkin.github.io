from itertools import permutations
number = '0123456789'
permu = permutations(number)
permu = list(permu)
for j in range (len(permu)):
    if j == 999_999:
        print(permu[j])