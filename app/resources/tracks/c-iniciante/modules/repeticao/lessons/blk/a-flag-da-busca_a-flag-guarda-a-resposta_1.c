#include <stdio.h>
#include <stdbool.h>
#include <stdbool.h>
int main(void){

bool achei = false;
for (int d = 2; d <= 11; d++) {
    if (12 % d == 0) {
        achei = true;
        break;
    }
}
printf("%d\n", achei);

return 0;}
