import numpy as np

class MLP:
    def __init__(self, layers, activation, clipValue = 500, weightInit = None, seed=None,lossFunc = 'mean',a=0):

        """
        layers - List of layers. First layer must match the number of inputs and last layer must match the number of outputs
        activation - is the activation function for the neural network
        clipValue - certain values above clipValue are removed to prevent overflow errors
        weightInit - is the optimizer for weight initialization
        seed - uses a certain random seed to initialise weights and biases
        lossFunc - what loss function will the neural network be using to evaluate itself
        """

        np.random.seed(seed)
        self.numLayers = len(layers)
        self.layerSizes = layers
        self.weights = []
        self.biases = []
        self.activationFunction = activation.lower()
        self.lossFunc = lossFunc.lower() 
        self.clipValue = clipValue
        self.weightInit = weightInit.lower()
        self.CPUUsage = 0
        self.a = a

        #init network hyperparameters

        for layer in range(self.numLayers - 1):
            if self.weightInit == "xavier":
                weight = np.random.randn(layers[layer], layers[layer + 1]) / np.sqrt(layers[layer])
            elif self.weightInit == "he":
                weight = np.random.randn(layers[layer], layers[layer + 1]) * np.sqrt(2 / layers[layer])
            else:
                weight = np.random.randn(layers[layer], layers[layer + 1])

            self.weights.append(weight)
            self.biases.append(np.zeros((1, layers[layer + 1])))

        #init random weights and biases using corresponding optimizers

    def __sigmoid(self, x):
        
        #sigmoid activation function
        x = np.clip(x, -self.clipValue, self.clipValue)
        return 1 / (1 + np.exp(-x))


    def __sigmoidDerivative(self, x):

        #sigmoid activation function derivative
        return x * (1 - x)

    def __relu(self, x):

        #relu activation function
        x = np.clip(x, -self.clipValue, self.clipValue)
        return np.maximum(0, x)

    def __reluDerivative(self, x):

        #relu activation function derivative
        return np.where(x > 0, 1, 0)

    def __leakyRelu(self, x):

        #leaky relu activation function
        x = np.clip(x, -self.clipValue, self.clipValue)
        return np.where(x > 0, x, self.a * x)

    def __leakyReluDerivative(self, x, a=0.005):

        #leaky relu activation derivative
        return np.where(x > 0, 1, a)

    def __softmax(self, x):

        x = np.clip(x, -self.clipValue, self.clipValue)  #Clip to prevent overflow errors
        expon = np.exp(x) 
        return expon / np.sum(expon, axis=1, keepdims=True)  #Normalize

    def __activation(self, x):

        #function that compiles all activation functions into one function 
        #I added this because it made the logic clearer and made it very easy to add new experimental activation functions
        if self.activationFunction == 'sigmoid':
            return self.__sigmoid(x)
        elif self.activationFunction == 'relu':
            return self.__relu(x)
        elif self.activationFunction == 'leakyrelu':
            return self.__leakyRelu(x)

    def __activationDerivative(self, x):

        #function that compiles all activation function derivatives into one function
        #I added this because it made the logic clearer and made it very easy to add new experimental activation functions
        if self.activationFunction == 'sigmoid':
            return self.__sigmoidDerivative(x)
        elif self.activationFunction == 'relu':
            return self.__reluDerivative(x)
        elif self.activationFunction == 'leakyrelu':
            return self.__leakyReluDerivative(x)

    def __lossDerivative(self, predictions, labels):

        #derivative of loss functions
        if self.lossFunc == 'mean':
            return self.__meanLossDerivative(predictions, labels)
        elif self.lossFunc == 'cross':
            return self.__crossEntropyLossDerivative(predictions, labels)

    def __meanLossDerivative(self, predictions, labels):
        return 2 * (predictions - labels) 
    
    def __crossEntropyLossDerivative(self, predictions, labels):
        return predictions - labels


    def __forward(self, incomingConnections, FLOPPER=False):
        """
        forward function for neural network 
        incomingConnections - the input values from the data (in this case pixel values from images)
        FLOPPER - is a variable to toggle CPU usage monitoring 
        """

        self.activations = [incomingConnections]
        for layer in range(self.numLayers - 2): 
            #for each layer calculate dot product from last item stored in self.activations and store it in self.activations
            dotProduct = np.dot(self.activations[-1], self.weights[layer]) + self.biases[layer]
            activatedDotProduct = self.__activation(dotProduct)
            self.activations.append(activatedDotProduct)

            if FLOPPER: #monitor CPU usage
                self.countFlops()

        outputLayer = np.dot(self.activations[-1], self.weights[-1]) + self.biases[-1] #Calculate the final output. 
        answer = self.__softmax(outputLayer) #Normalises output layer
        self.activations.append(answer) #Stores answer in self.activations

        if FLOPPER: #monitor CPU usage
            self.countFlops()

        return answer
    
    def __countFlops(self):
        #this estimate is not at all accurate however it is directly proportional with the real FLOP values
        height, width = self.activations[-2].shape  #finds dimensions of activations
        randomThing = self.weights[-1].shape[1]     #finds shape of weights
        flops = height * width * randomThing        #multiplies all dimensions together
        self.CPUUsage += flops                      #adds calculated product to cumumilative variable

    def __crossEntropyLoss(self, predictions, labels):
        #Cross enthropy loss function 
        loss = -np.sum(labels * np.log(predictions)) / labels.shape[0]
        return loss
    
    def __meanLoss(self,predictions,labels):
        #mean loss function
        loss = np.mean((predictions - labels) ** 2)
        return loss

    def __loss(self,predictions,labels):
        #function containing all loss methods so that I can add new ones easily and so that the program structure is clearer
        if self.lossFunc == 'mean': 
            return self.__meanLoss(predictions,labels)
        elif self.lossFunc == 'cross':
            return self.__crossEntropyLoss(predictions,labels)
    

    def __backward(self, targets, lr, FLOPPER):

        """
        targets - takes a One-hot-encoded list as a target for what the model output should be
        lr - the learning rate koeficcient
        FLOPPER - is a variable to toggle CPU usage monitoring 
        """

        outputLayerError = self.lossDerivative(self.activations[-1], targets) #gets derivative of final output in regards to the neural network output

        errorO = [outputLayerError]
        for index in range(self.numLayers - 2, 0, -1): # for each layer starting from the end
            error = np.dot(errorO[0], self.weights[index].T) * self.activationDerivative(self.activations[index])     
            errorO.insert(0, error)                                                                                 

            if FLOPPER: # calculates CPU usage
                self.countFlops()

        for index in range(self.numLayers - 1): #for each layer excluding the last layer
            weightGradient = np.dot(self.activations[index].T, errorO[index]) #calculates the gradients of the weights by using dot product of errorO and the relevant layer
            biasGradient = np.sum(errorO[index], axis=0, keepdims=True) # calculates the gradients of the biases

            self.weights[index] -= lr * weightGradient # adjusts weights
            self.biases[index] -= lr * biasGradient # adjusts biases

            if FLOPPER: # calculates CPU usage
               self.countFlops() 



    def train(self, inputs, targets, numEpochs, lr, batchSize, testInputs = None, testLabels = None,
               decayRate=1, avgLossToggle=False, recordUsage=False, epochLosses=False,stopper = False):
        
        """
        inputs - list of lists. Each sublist is a flattened vector image.
        targets - list of lists. Each sublist is the one-hot-encoded answer.
        numEpochs - the number of epochs
        lr - the learning rate constant
        batchSize - the number of images used per step during batch gradient descent. Keep higher for quicker convergence
        testInputs and testLabels - similar to inputs and targets but should be from the testing dataset. Used for research.
        decayRate - the rate at which learning rate decays. Allows higher initial lr values without instability. A good range of values is 1>lr>0.75 depending on training dataset size.
        avgLossToggle - returns the average loss every batch. Used for research
        recordUsage - do not toggle on - super specific and used for research
        epochLosses - do not toggle on - super specific and used for research
        stopper - a toggle to premature stopping when there is a need to optimize training time at the cost of accuracy. Succeptable to ending prematurely when encountering instability (loss randomly spiking). Lower lr is recommended.
        """


        indexes = inputs.shape[0]
        lossList = []
        usageSuperlist = []
        epochLossesList = []

        print(f"beginning training with  {numEpochs} epochs and layer sizes {self.layerSizes}")

        for epoch in range(numEpochs):
            lossEpochList = [] # shuffles training images
            shuffledIndexes = np.random.permutation(indexes)
            Inputs = inputs[shuffledIndexes]
            Labels = targets[shuffledIndexes]

            if epochLosses: # option to record losses for each epoch
                testPredictions = self.__forward(testInputs)
                testLoss = self.__loss(testPredictions, testLabels)
                epochLossesList.append(testLoss)
                print(testLoss)

            for batch in range(0, indexes, batchSize): # sorts out batch system
                batchInputs = Inputs[batch: (batch + batchSize)]
                batchLabels = Labels[batch: (batch + batchSize)]

                predictions = self.__forward(batchInputs, recordUsage) # sets up backpropagation
                loss = self.__loss(predictions, batchLabels)
                lossEpochList.append(loss)

                self.__backward(batchLabels, lr, recordUsage)


            lr *= decayRate

            avgLoss = np.mean(lossEpochList) # gets average loss for the epoch


            if recordUsage: # records CPU usage every epoch if boolean variable recordUsage is True
                testPredictions = self.__forward(testInputs)
                avgLoss = self.__loss(testPredictions, testLabels)
                usageSuperlist.append([avgLoss, self.CPUUsage])
    


            lossList.append(avgLoss) # appends average loss to a list

            if stopper: # if average loss stays the same MLP stops training early
                if len(lossList) >= 4:
                    if ((lossList[-2] + lossList[-1]) / 2)  / ((lossList[-3] + lossList[-4]) / 2) == 1:
                        print("Stopped")
                        break

            print(f'Epoch {epoch + 1} / {numEpochs}, Average Loss: {avgLoss:.10f},CPU FLOPs: {self.CPUUsage} lr: {lr:.10f}') # variable print out for debugging

        # various things that I might want the MLP to return based on the input variables
        if recordUsage: 
            return usageSuperlist

        if epochLosses:
            if avgLossToggle:
                return lossList, epochLossesList
            else:
                return epochLossesList
        else:
            if avgLossToggle:
                return lossList

    def predict(self, inputs, returnProbabilities = False):
        """
        inputs - input one item if data, with the same resolution as the size as the input layer size. Must be flattened.

        a number is outputted that relates to the index in the output layer.
        """

        predictions = self.__forward(inputs)

        if returnProbabilities == False:
            return np.argmax(predictions, axis=1)
        else:
            return self.__softmax(predictions) * 100

    def save(self, filename):
        """
        Saves the parameters to a file specified by 'filename'
        """


        import pickle
        file = open(filename, 'wb')
        pickle.dump({
            'layerSizes': self.layerSizes,
            'weights': self.weights,
            'biases': self.biases,
            'activationFunction': self.activationFunction,
            'clipValue': self.clipValue,
            'weightInit': self.weightInit
        }, file)
        file.close()

    def load(self, filename):
        """
        Loads paramaters from save file specified by 'filename'
        A network must already be initialized to call this.
        """

        import pickle
        file = open(filename,'rb')
        data = pickle.load(file)
        self.layerSizes = data['layerSizes']
        self.numLayers = len(self.layerSizes)
        self.weights = data['weights']
        self.biases = data['biases']
        self.activationFunction = data['activationFunction']
        self.clipValue = data['clipValue']
        self.weightInit = data['weightInit']
        file.close()

