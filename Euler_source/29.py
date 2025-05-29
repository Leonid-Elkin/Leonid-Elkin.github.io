<<<<<<< HEAD
termlist = []

for number in range (2,101):

    for power in range (2,101):
        term = number**power
        
        if term not in termlist:
            termlist.append(term)

=======
termlist = []

for number in range (2,101):

    for power in range (2,101):
        term = number**power
        
        if term not in termlist:
            termlist.append(term)

>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
print(len(termlist))