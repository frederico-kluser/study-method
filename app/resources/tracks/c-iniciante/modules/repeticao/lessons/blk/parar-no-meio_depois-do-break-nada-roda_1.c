#include <stdio.h>
#include <stdbool.h>

int main(void){
for (int i = 1; i <= 3; i++) {
    printf("antes\n");
    if (i == 2) {
        break;
    }
    printf("depois\n");
}

return 0;}
