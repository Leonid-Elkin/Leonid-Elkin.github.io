<<<<<<< HEAD
class Fraction:
    def __init__(self,numerator,denominator):
        self.numerator = list(str(numerator))
        self.denominator = list(str(denominator))
        self.result = numerator / denominator
    def simple(self):
        for index, digit in enumerate(self.numerator):
            if digit in self.denominator:
                if int(self.numerator.pop(index - 1)) / int(self.denominator.pop(self.denominator.index(digit))) == self.result:
                    return True
        return False
    
fraction = Fraction(49,98)
=======
class Fraction:
    def __init__(self,numerator,denominator):
        self.numerator = list(str(numerator))
        self.denominator = list(str(denominator))
        self.result = numerator / denominator
    def simple(self):
        for index, digit in enumerate(self.numerator):
            if digit in self.denominator:
                if int(self.numerator.pop(index - 1)) / int(self.denominator.pop(self.denominator.index(digit))) == self.result:
                    return True
        return False
    
fraction = Fraction(49,98)
>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
print(fraction.simple())