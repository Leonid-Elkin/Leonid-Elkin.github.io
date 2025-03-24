squareofsums=0
sumofsquares=0

for i in range (101):
    squareofsums += i
    sumofsquares += i ** 2

squareofsums=squareofsums ** 2
print(squareofsums-sumofsquares)