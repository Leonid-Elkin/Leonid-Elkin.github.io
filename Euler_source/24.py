<<<<<<< HEAD
from itertools import permutations
number = '0123456789'
permu = permutations(number)
permu = list(permu)
for j in range (len(permu)):
    if j == 999_999:
=======
from itertools import permutations
number = '0123456789'
permu = permutations(number)
permu = list(permu)
for j in range (len(permu)):
    if j == 999_999:
>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
        print(permu[j])