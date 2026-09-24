#include <stdio.h>
#include <stdbool.h>

int main(void){
for (int linha = 1; linha <= 2; linha++) {
    printf("linha %d:", linha);
    for (int coluna = 1; coluna <= 3; coluna++) {
        printf(" %d", coluna);
    }
    printf("\n");
}

return 0;}
