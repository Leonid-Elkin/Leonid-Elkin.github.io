termlist = []

for number in range (2,101):

    for power in range (2,101):
        term = number**power
        
        if term not in termlist:
            termlist.append(term)

print(len(termlist))