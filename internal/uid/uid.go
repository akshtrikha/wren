package uid

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"
)

func New() string {
	b := make([]byte, 6)
	rand.Read(b)
	return fmt.Sprintf("%x-%s", time.Now().UnixMilli(), hex.EncodeToString(b))
}
