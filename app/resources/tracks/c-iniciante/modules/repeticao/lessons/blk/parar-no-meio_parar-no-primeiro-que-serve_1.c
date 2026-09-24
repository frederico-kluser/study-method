#include <stdio.h>
#include <stdbool.h>

int main(void){
int k = 1;
for (k = 1; k <= 100; k++) {
    if (k * k > 50) {
        break;
    }
}
printf("%d\n", k);

return 0;}
