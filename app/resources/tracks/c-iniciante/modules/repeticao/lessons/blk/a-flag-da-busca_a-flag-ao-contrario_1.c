#include <stdio.h>
#include <stdbool.h>
#include <stdbool.h>
int main(void){

bool primo = true;
for (int d = 2; d <= 8; d++) {
    if (9 % d == 0) {
        primo = false;
        break;
    }
}
printf("%d\n", primo);

return 0;}
