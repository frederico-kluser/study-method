#include <stdio.h>
#include <stdbool.h>

int main(void){
for (int i = 1; i <= 10; i++) {
    if (i == 4) {
        break;
    }
    printf("%d\n", i);
}

return 0;}
